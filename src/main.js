import JSZip from "jszip";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const ffmpeg = new FFmpeg();

const filesInput = document.getElementById("files");
const button = document.getElementById("generate");
const status = document.getElementById("status");
const bar = document.getElementById("bar");

function setProgress(p) {
  bar.style.width = `${p}%`;
}

function setStatus(text) {
  status.textContent = text;
}

async function loadFFmpeg() {
  if (ffmpeg.loaded) return;

  setStatus("Chargement du moteur audio...");
  await ffmpeg.load({
    coreURL: new URL(
      "@ffmpeg/core/dist/ffmpeg-core.js",
      import.meta.url
    ).toString(),
    wasmURL: new URL(
      "@ffmpeg/core/dist/ffmpeg-core.wasm",
      import.meta.url
    ).toString()
  });

  ffmpeg.on("progress", ({ progress }) => {
    setProgress(Math.round(progress * 80));
  });
}

async function convertToOgg(file) {
  const input = file.name;
  const output = file.name.replace(/\.[^/.]+$/, ".ogg");

  await ffmpeg.writeFile(input, await fetchFile(file));
  await ffmpeg.exec([
    "-i", input,
    "-c:a", "libvorbis",
    "-q:a", "4",
    output
  ]);

  const data = await ffmpeg.readFile(output);
  return new File([data.buffer], output, { type: "audio/ogg" });
}

button.onclick = async () => {
  const files = Array.from(filesInput.files);
  if (files.length === 0) {
    alert("Aucun fichier sélectionné");
    return;
  }

  button.disabled = true;
  setProgress(0);

  try {
    await loadFFmpeg();

    const zip = new JSZip();
    const sounds = {};
    const soundsFolder = zip.folder("assets/soundboard/sounds");

    let index = 0;

    for (const file of files) {
      setStatus(`Traitement : ${file.name}`);

      let ogg = file;
      if (!file.name.endsWith(".ogg")) {
        ogg = await convertToOgg(file);
      }

      const id = ogg.name.replace(".ogg", "").toLowerCase();

      sounds[id] = {
        sounds: [`soundboard:${id}`]
      };

      soundsFolder.file(ogg.name, await ogg.arrayBuffer());

      index++;
      setProgress(Math.round((index / files.length) * 80));
    }

    zip.folder("assets/soundboard")
      .file("sounds.json", JSON.stringify(sounds, null, 2));

    zip.file("pack.mcmeta", JSON.stringify({
      pack: {
        pack_format: 15,
        description: "Soundboard Resource Pack"
      }
    }, null, 2));

    setProgress(100);
    setStatus("Terminé !");

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "soundboard_resource_pack.zip";
    a.click();

  } catch (e) {
    console.error(e);
    alert("Erreur : " + e.message);
  } finally {
    button.disabled = false;
  }
};
