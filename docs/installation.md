# Installation

Download the packaged application and run it directly. You do not need to build the project from source.

## Download the latest build

Start here:

[Desktop Release workflow runs](https://github.com/DavidJBoardman/ai-vault-dashboard/actions)

For most users, the process is:

1. open the GitHub Actions page
2. open the latest successful `Desktop Release` workflow run
3. scroll to the `Artifacts` section near the bottom of the page
4. download the file for your operating system
5. unzip the downloaded file
6. move the extracted application to the folder where you want to keep it
7. run the application directly

Current artifact names are expected to look like:

- `vault-analyser-windows`
- `vault-analyser-macos`

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

- GitHub Actions artifacts are the current download location for packaged builds
- if you cannot find the files, check that the workflow run completed successfully
- if a newer build is needed, use the latest successful `Desktop Release` run
