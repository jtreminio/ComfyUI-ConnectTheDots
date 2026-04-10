# ComfyUI-ConnectTheDots

Connect compatible nodes without scrolling across your graph.

ComfyUI-ConnectTheDots adds a simple sidebar to ComfyUI so you can find and connect matching properties from one place. It is designed for larger workflows where moving back and forth across the canvas slows everything down.

## Demo

https://github.com/user-attachments/assets/b2e35306-de46-444f-9e60-929e059fb4ef

## Why Use It

- Open connections from the node you are working on.
- See compatible properties in a clear sidebar.
- Hover a property to jump to its source node on the canvas.
- Connect multiple properties without reopening the menu.
- Keep your place in complex workflows.

## How It Works

1. Right-click any node.
2. Select `Connect The Dots`.
3. Browse the compatible properties shown in the sidebar.
4. Hover a property to preview its node on the canvas.
5. Click the property to make the connection.

## Installation

Place this extension inside your `ComfyUI/custom_nodes` folder, then restart ComfyUI.

## What It Helps With

- Connecting VAEs, models, images, and other common graph properties
- Working faster in large or crowded workflows
- Reducing repeated panning and zooming across the canvas

## Summary

ComfyUI-ConnectTheDots makes graph wiring easier, faster, and more readable, especially in larger ComfyUI projects.

## Development

- `npm run format` formats the project with Biome.
- `npm run format:check` reports formatting drift without changing files.
- `npm run lint` runs Biome lint checks.
- `npm run lint:fix` applies Biome's safe lint fixes.
- `npm run check` runs formatting, linting, and TypeScript checks together.
