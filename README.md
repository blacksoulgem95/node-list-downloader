# Node List Downloader

**Node List Downloader** is a simple tool that allows you to download a list of files from a provided list of links. Everything is managed via Docker for quick and hassle-free configuration.

## Requirements

- Docker installed on your system.
- A list of links to download, saved in a text file (e.g., `downloads.txt`).

## Configuration

1. Create a file named `downloads.txt` (or another name of your choice) containing the links to download, one per line. Example:

   ```
   https://example.com/file1.zip
   https://example.com/file2.zip
   https://example.com/file3.zip
   ```

2. Prepare a directory where you want the downloaded files to be saved, e.g., `/path/to/output`.

## Usage

1. Run the Docker command to start the container:

   ```bash
   docker run \
       -v /path/to/output:/opt/output \
       -v /path/to/downloads.txt:/opt/config/downloads.txt \
       blacksoulgem95/node-list-downloader
   ```

    - **`/path/to/output`**: The path to the directory on your system where the downloaded files will be saved.
    - **`/path/to/downloads.txt`**: The path to the file containing the links to download.

2. The tool will automatically read the links from `/opt/config/downloads.txt` and download the files into the `/opt/output` directory.

## Extracting Links from HTML Pages

The tool supports extracting a series of links from an HTML page using the built-in extractor. Follow these steps:

1. Run the extractor command:

   ```bash
   npm run extractor
   ```

2. Set the required environment variables:

    - `EXTRACTOR_URL`: The URL of the HTML page to extract links from.
    - `EXTRACTOR_OUTPUT`: The output file
    - `EXTRACTOR_TYPE`: The type of extractor to use. Currently supported type:
      - `ARCHIVE_ORG`
    - `EXTRACTOR_WRITE_FLAG`: the write flag for Node.js (default `a` for `append`)
      - [More info on Node.js Documentation](https://nodejs.org/api/fs.html#file-system-flags)

Example:

```bash
EXTRACTOR_URL=https://archive.org/download/example_project \
EXTRACTOR_TYPE=ARCHIVE_ORG \
EXTRACTOR_OUTPUT=./list.txt
npm run extractor
```

Dockerized:
```bash
   docker run \
       -e EXTRACTOR_URL=https://archive.org/download/example_project \
       -e EXTRACTOR_TYPE=ARCHIVE_ORG \
       -v /path/to/output.txt:/opt/output/downloads.txt \
       blacksoulgem95/node-list-downloader
```

### Language Configuration

The tool supports language selection through the `LANGUAGE` environment variable. The following languages are available:

- `cn` - Chinese
- `en` - English
- `es` - Spanish
- `fr` - French
- `it` - Italian
- `jp` - Japanese
- `ru` - Russian

Example:

```bash
docker run -e LANGUAGE=en \
    -v /path/to/output:/opt/output \
    -v /path/to/downloads.txt:/opt/config/downloads.txt \
    blacksoulgem95/node-list-downloader
```

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
