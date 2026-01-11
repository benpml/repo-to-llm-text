# Repo2txt Remember

Convert code repositories to a single formatted text file with **persistent file preferences**.

## Features

- **Local Directory Upload** - Select a folder from your computer (primary method)
- **GitHub URL Upload** - Fetch any public GitHub repository
- **Persistent Preferences** - Your file selections are saved and restored automatically
- **Profile Management** - View and delete saved profiles
- **Extension Filtering** - Filter files by common extensions
- **Indeterminate Checkboxes** - Visual indicator for partially selected folders

## Live Demo

Visit: https://benpml.github.io/repo2txt-remember/

## How It Works

1. Upload a local directory or enter a GitHub URL
2. Select/deselect files you want to include
3. Click "Save Preferences" to remember your selections
4. Next time you upload the same directory/repo, your preferences are restored
5. Generate formatted text output with directory structure

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Deployment

This app is automatically deployed to GitHub Pages via GitHub Actions when you push to the `main` branch.

## Credits

Inspired by [repo2txt](https://github.com/abinthomasonline/repo2txt) by Abin Thomas.
