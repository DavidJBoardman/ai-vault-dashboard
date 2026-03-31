# Installation

Download the packaged application and run it directly. You do not need to build the project from source.

## Download the latest version

Start here:

[Download from GitHub Releases](https://github.com/DavidJBoardman/ai-vault-dashboard/releases)

For most users, the process is:

1. open the Releases page
2. choose the latest version at the top
3. download the file for your operating system
4. unzip the downloaded file
5. move the extracted application to the folder where you want to keep it
6. run the application directly

Current download files are expected to look like:

- `vault-analyser-windows.zip`
- `vault-analyser-macos.zip`

## Windows

Open the extracted folder and double-click the `.exe` file. There is no separate installer step.

### Where your project files are stored

`C:\Users\<your-user>\Vault Analyser\projects\`

The application also stores related working folders there, including uploads, projections, segmentations, and exports.

## macOS

Open the extracted `.app`.

Because the packaged application is not signed, macOS may block it on first launch.

If macOS blocks it, use Terminal and run:

```bash
xattr -dr com.apple.quarantine "/path/to/Vault Analyser.app"
open "/path/to/Vault Analyser.app"
```

### Where your project files are stored

`/Users/<your-user>/Vault Analyser/projects/`

The application also stores related working folders there, including uploads, projections, segmentations, and exports.

## Notes

- packaged builds are published on the GitHub Releases page
- if you cannot find the files, check that the latest release completed successfully
