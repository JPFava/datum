# Datum

A STEP and IGES review bench. Open a model, orbit it, section it, measure it, and pin notes on the faces you want to talk about. If the STEP file already contains construction sketches or PMI notes, Datum can show those too.

Pins stay in the browser that created them. They are matched to the file contents, not written back into the STEP file.

## Run it on your computer

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:8080

Leave that terminal window open. The program keeps running until you stop it with Ctrl+C or close the window. It does not depend on the Grok preview.

No account and no database are required.

## Use it

- **Open** a `.stp`, `.step`, `.igs`, or `.iges` file, or drop one on the window.
- **Briefing** copies the pins as text you can paste into a chat.
- **Packet** downloads the same notes as a `.datum.json` file. Open that file later, on a model with the same contents, to bring the pins back.
- **Image** opens a picture of the current view. Right-click it and choose Save image as.
- **Sketches** and **File notes** appear under Display when the STEP file contains them.

## Build a copy you can start without the dev server

```bash
npm run build
npm run preview
```

The preview command serves the built program at http://localhost:4173
