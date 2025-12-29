# Converting PNG to ICO

The `favicon.ico` file needs to be a proper ICO format. Currently it's a PNG copy.

To create a proper ICO file:

## Option 1: Online Tool
1. Go to https://convertio.co/png-ico/
2. Upload `favicon-32x32.png`
3. Download the converted `favicon.ico`
4. Replace the current `favicon.ico` file

## Option 2: ImageMagick (if installed)
```bash
convert favicon-32x32.png favicon.ico
```

## Option 3: Use the 32x32 PNG directly
Some browsers will accept a PNG file with .ico extension, but for best compatibility, use a proper ICO file.

