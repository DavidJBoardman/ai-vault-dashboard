# Installation

End users should use the packaged application builds published with each tagged release, not build the project from source.

## Download from a tagged release

Each downloadable build is attached to a GitHub release tag page.

Example format:

`https://github.com/DavidJBoardman/ai-vault-dashboard/releases/tag/<tag>`

General release listing:

[Browse tagged releases on GitHub](https://github.com/DavidJBoardman/ai-vault-dashboard/releases)

Use the release tag page for the version you want, then download the matching Windows or macOS archive from that page.

## Installation model

The packaged builds do not require a traditional installer.

In both operating systems, the general process is:

1. download the archive from the tagged release page
2. unzip the archive
3. move the extracted application to the folder where you want to keep it
4. run the application directly

## Windows

### What to download

Download the Windows build archive from the chosen release tag page, unzip it, and keep the extracted application in the folder you want to use.

### How to run it

Run the extracted `.exe` directly. No separate installation step is required.

![Windows release download page](images/installation/windows-release-download.png)

### Where project data is stored

On Windows, the packaged application stores its working data under:

`C:\Users\<your-user>\Vault Analyser\`

Project data is stored under:

`C:\Users\<your-user>\Vault Analyser\projects\`

Other generated working folders are created alongside it, such as uploads, projections, segmentations, and exports.

## macOS

### What to download

Download the macOS build archive from the chosen release tag page, unzip it, and move the extracted `.app` bundle to the folder where you want to keep it, for example `Applications` or another folder you manage yourself.

### How to run it

Run the extracted `.app` directly.

Because the packaged application is not signed, macOS may block it on first launch.

If that happens, one terminal-based approach is:

```bash
xattr -dr com.apple.quarantine "/path/to/Vault Analyser.app"
open "/path/to/Vault Analyser.app"
```

![macOS release download page](images/installation/macos-release-download.png)

### Where project data is stored

On macOS, the packaged application stores its working data under:

`/Users/<your-user>/Vault Analyser/`

Project data is stored under:

`/Users/<your-user>/Vault Analyser/projects/`

Other generated working folders are created alongside it, such as uploads, projections, segmentations, and exports.

## Summary

- download from the GitHub release tag page for the version you want
- unzip the archive
- move the extracted app to the folder where you want to keep it
- run it directly
- find saved project data under the `Vault Analyser/projects/` folder in your home directory
