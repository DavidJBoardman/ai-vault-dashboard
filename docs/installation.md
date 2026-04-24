# Installation

Download the packaged desktop application and run it directly. You do not need to build the project from source to use Vault Analyser.

## 1. Download

Go to the [GitHub Releases page](https://github.com/DavidJBoardman/ai-vault-dashboard/releases) and download the file for your operating system:

| Operating system | File to download |
|------------------|-----------------|
| Windows | `vault-analyser-windows.zip` |
| macOS | `vault-analyser-macos.zip` |

Choose the latest release shown at the top of the page.

## 2. Install and run

### Windows

1. Unzip the downloaded file.
2. Open the extracted folder.
3. Double-click the `.exe` file — no installer needed.

### macOS

1. Unzip the downloaded file.
2. Double-click the `.app` to open it.

!!! note "macOS security warning"
    Because the application is not signed, macOS may block it on first launch. If this happens, open **Terminal** and run:

    ```bash
    xattr -dr com.apple.quarantine "/path/to/Vault Analyser.app"
    open "/path/to/Vault Analyser.app"
    ```

    Replace `/path/to/` with the actual location of the app (e.g. your Downloads folder).

## 3. Where your projects are saved

The application creates a **Vault Analyser** folder in your home directory. Project files, generated images, segmentation outputs, and exports are stored there automatically.

| Operating system | Project folder |
|------------------|---------------|
| Windows | `C:\Users\<your-user>\Vault Analyser\projects\` |
| macOS | `/Users/<your-user>/Vault Analyser/projects/` |

## Before opening your first project

- Make sure the scan you want to analyse is available as an `E57` file.
- Keep enough free disk space for derived files such as projections, masks, and exports.
- Expect the first AI-assisted segmentation run to take longer while the model is loaded.
---

# Uninstalling

Removing the application binary does not delete your project data. If you only want to free the installed app, skip the "User data" step.

### macOS

1. Quit Vault Analyser if it is running.
2. Drag **Vault Analyser.app** from `/Applications` (or wherever you placed it) to the Trash.
3. **User data (optional):** delete `/Users/<your-user>/Vault Analyser/projects/` to remove your projects and exports.

### Windows

1. Quit Vault Analyser if it is running.
2. Delete the extracted folder where you unzipped the release (it contains the `.exe` — no Windows installer was used, so there is no entry in **Installed apps**).
3. **User data (optional):** delete `C:\Users\<your-user>\Vault Analyser\projects\` to remove your projects and exports.

!!! warning "Back up first"
    The `Vault Analyser` folder in your home directory contains all your project files, segmentations, and exports. Copy anything you want to keep to another location before deleting it.
