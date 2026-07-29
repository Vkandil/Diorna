use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Duration,
};

use reqwest::{
    StatusCode, Url,
    header::{ACCEPT, CONTENT_TYPE, LOCATION},
    redirect::Policy,
};
use scraper::{Html, Selector};

use crate::error::{DiornaError, Result};

const HTML_LIMIT: usize = 512 * 1024;
const IMAGE_LIMIT: usize = 2_500_000;
const FAVICON_LIMIT: usize = 128 * 1024;
const MAX_REDIRECTS: usize = 5;

pub(crate) struct PreviewAsset {
    pub(crate) bytes: Vec<u8>,
    pub(crate) extension: &'static str,
}

pub(crate) struct PreviewPayload {
    pub(crate) final_url: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) site_name: String,
    pub(crate) image_url: String,
    pub(crate) favicon_url: String,
    pub(crate) image: Option<PreviewAsset>,
    pub(crate) favicon: Option<PreviewAsset>,
}

struct RemoteResponse {
    final_url: Url,
    content_type: String,
    bytes: Vec<u8>,
}

pub(crate) async fn fetch(url: &str) -> Result<PreviewPayload> {
    let requested = validated_url(url)?;
    let response = fetch_bounded(requested, "text/html,application/xhtml+xml", HTML_LIMIT).await?;
    if !response.content_type.is_empty()
        && !response.content_type.contains("text/html")
        && !response.content_type.contains("application/xhtml+xml")
    {
        return Err(DiornaError::InvalidData(
            "The URL does not point to an HTML page".into(),
        ));
    }
    let html = String::from_utf8_lossy(&response.bytes);
    let metadata = parse_html(&html, &response.final_url);
    let image = if metadata.image_url.is_empty() {
        None
    } else {
        fetch_image(&metadata.image_url, IMAGE_LIMIT).await.ok()
    };
    let favicon = if metadata.favicon_url.is_empty() {
        None
    } else {
        fetch_image(&metadata.favicon_url, FAVICON_LIMIT).await.ok()
    };
    Ok(PreviewPayload {
        final_url: response.final_url.to_string(),
        title: metadata.title,
        description: metadata.description,
        site_name: metadata.site_name,
        image_url: metadata.image_url,
        favicon_url: metadata.favicon_url,
        image,
        favicon,
    })
}

struct Metadata {
    title: String,
    description: String,
    site_name: String,
    image_url: String,
    favicon_url: String,
}

fn parse_html(html: &str, base: &Url) -> Metadata {
    let document = Html::parse_document(html);
    let meta_selector = Selector::parse("meta").expect("valid meta selector");
    let title_selector = Selector::parse("title").expect("valid title selector");
    let icon_selector = Selector::parse("link[rel][href]").expect("valid icon selector");
    let mut values = std::collections::HashMap::<String, String>::new();
    for element in document.select(&meta_selector) {
        let key = element
            .value()
            .attr("property")
            .or_else(|| element.value().attr("name"))
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        let content = element
            .value()
            .attr("content")
            .map(normalize_text)
            .unwrap_or_default();
        if !key.is_empty() && !content.is_empty() {
            values.entry(key).or_insert(content);
        }
    }
    let host = base
        .host_str()
        .unwrap_or_default()
        .trim_start_matches("www.")
        .to_string();
    let document_title = document
        .select(&title_selector)
        .next()
        .map(|element| normalize_text(&element.text().collect::<String>()))
        .unwrap_or_default();
    let icon = document
        .select(&icon_selector)
        .find(|element| {
            element
                .value()
                .attr("rel")
                .unwrap_or_default()
                .split_ascii_whitespace()
                .any(|value| matches!(value.to_ascii_lowercase().as_str(), "icon" | "shortcut"))
        })
        .and_then(|element| element.value().attr("href"))
        .and_then(|value| base.join(value).ok())
        .map(|value| value.to_string())
        .unwrap_or_default();
    Metadata {
        title: truncate(
            first(&values, &["og:title", "twitter:title"])
                .filter(|value| !value.is_empty())
                .unwrap_or(if document_title.is_empty() {
                    &host
                } else {
                    &document_title
                }),
            160,
        ),
        description: truncate(
            first(
                &values,
                &["og:description", "twitter:description", "description"],
            )
            .map(String::as_str)
            .unwrap_or_default(),
            400,
        ),
        site_name: truncate(
            first(&values, &["og:site_name"])
                .map(String::as_str)
                .unwrap_or(&host),
            100,
        ),
        image_url: first(&values, &["og:image", "twitter:image"])
            .and_then(|value| base.join(value).ok())
            .map(|value| value.to_string())
            .unwrap_or_default(),
        favicon_url: icon,
    }
}

fn first<'a>(
    values: &'a std::collections::HashMap<String, String>,
    keys: &[&str],
) -> Option<&'a String> {
    keys.iter().find_map(|key| values.get(*key))
}

async fn fetch_image(url: &str, limit: usize) -> Result<PreviewAsset> {
    let response = fetch_bounded(validated_url(url)?, "image/*", limit).await?;
    let extension = image_extension(&response.content_type).ok_or_else(|| {
        DiornaError::InvalidData("The preview image has an unsupported content type".into())
    })?;
    Ok(PreviewAsset {
        bytes: response.bytes,
        extension,
    })
}

async fn fetch_bounded(mut url: Url, accept: &str, limit: usize) -> Result<RemoteResponse> {
    for redirect in 0..=MAX_REDIRECTS {
        let address = public_address(&url).await?;
        let host = url
            .host_str()
            .ok_or_else(|| DiornaError::InvalidData("URL host is missing".into()))?;
        let mut builder = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(4))
            .timeout(Duration::from_secs(8))
            .redirect(Policy::none())
            .no_proxy()
            .user_agent("Diorna/0.1 link-preview");
        if host.parse::<IpAddr>().is_err() {
            builder = builder.resolve(host, address);
        }
        let client = builder
            .build()
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        let mut response = client
            .get(url.clone())
            .header(ACCEPT, accept)
            .send()
            .await
            .map_err(|error| DiornaError::InvalidData(format!("Unable to fetch link: {error}")))?;
        if response.status().is_redirection() {
            if redirect == MAX_REDIRECTS {
                return Err(DiornaError::InvalidData(
                    "The link redirected too many times".into(),
                ));
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| DiornaError::InvalidData("Invalid redirect".into()))?;
            url = validated_url(
                url.join(location)
                    .map_err(|error| DiornaError::InvalidData(error.to_string()))?
                    .as_str(),
            )?;
            continue;
        }
        if response.status() != StatusCode::OK {
            return Err(DiornaError::InvalidData(format!(
                "The website returned {}",
                response.status()
            )));
        }
        if response
            .content_length()
            .is_some_and(|length| length > limit as u64)
        {
            return Err(DiornaError::InvalidData(
                "The remote preview is too large".into(),
            ));
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?
        {
            if bytes.len() + chunk.len() > limit {
                return Err(DiornaError::InvalidData(
                    "The remote preview is too large".into(),
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        return Ok(RemoteResponse {
            final_url: url,
            content_type,
            bytes,
        });
    }
    Err(DiornaError::InvalidData(
        "Unable to fetch the remote preview".into(),
    ))
}

fn validated_url(value: &str) -> Result<Url> {
    let url =
        Url::parse(value).map_err(|_| DiornaError::InvalidData("Enter a valid web URL".into()))?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(DiornaError::InvalidData(
            "Only public http:// and https:// links are supported".into(),
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| DiornaError::InvalidData("URL host is missing".into()))?
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err(DiornaError::InvalidData(
            "Local network links are not previewed".into(),
        ));
    }
    if let Ok(address) = host.parse::<IpAddr>()
        && !is_public_ip(address)
    {
        return Err(DiornaError::InvalidData(
            "Local network links are not previewed".into(),
        ));
    }
    Ok(url)
}

async fn public_address(url: &Url) -> Result<SocketAddr> {
    let host = url
        .host_str()
        .ok_or_else(|| DiornaError::InvalidData("URL host is missing".into()))?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| DiornaError::InvalidData("URL port is missing".into()))?;
    let addresses: Vec<_> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|error| DiornaError::InvalidData(format!("Unable to resolve link: {error}")))?
        .collect();
    if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(DiornaError::InvalidData(
            "Local network links are not previewed".into(),
        ));
    }
    Ok(addresses[0])
}

fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(value) => is_public_ipv4(value),
        IpAddr::V6(value) => is_public_ipv6(value),
    }
}

fn is_public_ipv4(value: Ipv4Addr) -> bool {
    let [a, b, c, _] = value.octets();
    !(value.is_private()
        || value.is_loopback()
        || value.is_link_local()
        || value.is_broadcast()
        || value.is_unspecified()
        || value.is_multicast()
        || a == 0
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113))
}

fn is_public_ipv6(value: Ipv6Addr) -> bool {
    let segments = value.segments();
    if let Some(mapped) = value.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }
    !(value.is_loopback()
        || value.is_unspecified()
        || value.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || (segments[0] == 0x2001 && segments[1] == 0x0db8))
}

fn image_extension(content_type: &str) -> Option<&'static str> {
    match content_type.split(';').next()?.trim() {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/svg+xml" => Some("svg"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
        _ => None,
    }
}

fn normalize_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate(value: &str, maximum: usize) -> String {
    let normalized = normalize_text(value);
    if normalized.chars().count() <= maximum {
        return normalized;
    }
    let mut output: String = normalized.chars().take(maximum.saturating_sub(1)).collect();
    output.push('…');
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_graph_metadata_and_relative_assets() {
        let html = r#"
          <html><head>
            <title>Fallback title</title>
            <meta property="og:title" content="A useful article">
            <meta property="og:description" content="A compact explanation.">
            <meta property="og:site_name" content="Diorna Journal">
            <meta property="og:image" content="/cover.png">
            <link rel="icon" href="/favicon.ico">
          </head></html>
        "#;
        let metadata = parse_html(html, &Url::parse("https://example.com/posts/one").unwrap());
        assert_eq!(metadata.title, "A useful article");
        assert_eq!(metadata.description, "A compact explanation.");
        assert_eq!(metadata.site_name, "Diorna Journal");
        assert_eq!(metadata.image_url, "https://example.com/cover.png");
        assert_eq!(metadata.favicon_url, "https://example.com/favicon.ico");
    }

    #[test]
    fn rejects_private_and_local_preview_destinations() {
        for value in [
            "http://localhost/test",
            "http://127.0.0.1/test",
            "http://10.0.0.8/test",
            "http://192.168.1.2/test",
            "file:///C:/secret.txt",
        ] {
            assert!(validated_url(value).is_err(), "{value} should be rejected");
        }
        assert!(validated_url("https://example.com/article").is_ok());
    }
}
