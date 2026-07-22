#[cfg(target_os = "windows")]
use windows::{
    Win32::{
        Storage::EnhancedStorage::PKEY_Title,
        System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            StructuredStorage::PROPVARIANT,
        },
        UI::Shell::{
            Common::{IObjectArray, IObjectCollection},
            DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW,
            PropertiesSystem::IPropertyStore,
            ShellLink,
        },
    },
    core::{Interface, PCWSTR},
};

#[cfg(target_os = "windows")]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Installs the three taskbar tasks required by the Windows shell contract.
/// Failure is non-fatal: managed environments may disable custom jump lists.
#[cfg(target_os = "windows")]
pub fn install_jump_list(executable: &std::path::Path) -> windows::core::Result<()> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let destinations: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        destinations.SetAppID(PCWSTR(wide("io.diorna.desktop").as_ptr()))?;
        let mut minimum_slots = 0;
        let _: IObjectArray = destinations.BeginList(&mut minimum_slots)?;
        let collection: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        let executable = executable.to_string_lossy();

        for (title, arguments) in [
            ("New note", "--new-note"),
            ("Quick capture", "--quick-capture"),
            ("Today", "--today"),
        ] {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(PCWSTR(wide(&executable).as_ptr()))?;
            link.SetArguments(PCWSTR(wide(arguments).as_ptr()))?;
            link.SetDescription(PCWSTR(wide(title).as_ptr()))?;
            link.SetIconLocation(PCWSTR(wide(&executable).as_ptr()), 0)?;
            let properties: IPropertyStore = link.cast()?;
            let title_value = PROPVARIANT::from(title);
            properties.SetValue(&PKEY_Title, &title_value)?;
            properties.Commit()?;
            collection.AddObject(&link)?;
        }

        let tasks: IObjectArray = collection.cast()?;
        destinations.AddUserTasks(&tasks)?;
        destinations.CommitList()
    }
}

#[cfg(not(target_os = "windows"))]
pub fn install_jump_list(_executable: &std::path::Path) -> Result<(), std::convert::Infallible> {
    Ok(())
}
