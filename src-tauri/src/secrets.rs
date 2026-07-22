use base64::{Engine, engine::general_purpose::STANDARD};
use zeroize::Zeroize;

use crate::error::{DiornaError, Result};

#[cfg(windows)]
pub fn protect(secret: &str) -> Result<String> {
    use windows::Win32::{
        Foundation::{HLOCAL, LocalFree},
        Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData},
    };

    let mut plaintext = secret.as_bytes().to_vec();
    let input = CRYPT_INTEGER_BLOB {
        cbData: plaintext.len() as u32,
        pbData: plaintext.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|error| DiornaError::WindowsSecurity(error.to_string()))?;
        let protected = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let encoded = STANDARD.encode(protected);
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        plaintext.zeroize();
        Ok(encoded)
    }
}

#[cfg(windows)]
pub fn unprotect(encoded: &str) -> Result<String> {
    use windows::Win32::{
        Foundation::{HLOCAL, LocalFree},
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
        },
    };

    let mut protected = STANDARD
        .decode(encoded)
        .map_err(|error| DiornaError::WindowsSecurity(error.to_string()))?;
    let input = CRYPT_INTEGER_BLOB {
        cbData: protected.len() as u32,
        pbData: protected.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|error| DiornaError::WindowsSecurity(error.to_string()))?;
        let plaintext = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let result = String::from_utf8(plaintext.to_vec())
            .map_err(|error| DiornaError::WindowsSecurity(error.to_string()))?;
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        protected.zeroize();
        Ok(result)
    }
}

#[cfg(not(windows))]
pub fn protect(_secret: &str) -> Result<String> {
    Err(DiornaError::WindowsSecurity(
        "DPAPI is available on Windows only".into(),
    ))
}

#[cfg(not(windows))]
pub fn unprotect(_encoded: &str) -> Result<String> {
    Err(DiornaError::WindowsSecurity(
        "DPAPI is available on Windows only".into(),
    ))
}

#[cfg(all(test, windows))]
mod tests {
    use super::{protect, unprotect};

    #[test]
    fn dpapi_round_trips_an_openrouter_key_without_plaintext_storage() {
        let key = "sk-or-v1-test-only";
        let protected = protect(key).unwrap();
        assert_ne!(protected, key);
        assert!(!protected.contains(key));
        assert_eq!(unprotect(&protected).unwrap(), key);
    }
}
