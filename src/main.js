// On importe depuis les URLs définies dans l'importmap du HTML
import JSZip from "jszip";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const ffmpeg = new FFmpeg();
let ffmpegLoaded = false;

const filesInput = document.getElementById("files");
const button = document.getElementById("generate");
const status = document.getElementById("status");
const bar = document.getElementById("bar");

function setProgress(p) {
    bar.style.width = `${p}%`;
}

function setStatus(text) {
    status.textContent = text;
    console.log(text);
}

async function loadFFmpeg() {
    if (ffmpegLoaded) return;

    setStatus("Téléchargement du moteur audio (cela peut prendre un moment la première fois)...");
    
    // URL de base pour la version 0.12.6 de ffmpeg-core
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ffmpegLoaded = true;
        setStatus("Moteur audio prêt !");
    } catch (err) {
        console.error("Erreur chargement FFmpeg:", err);
        setStatus("Erreur critique : Impossible de charger FFmpeg. Vérifiez la console (F12).");
        throw err;
    }
}

async function convertToOgg(file) {
    const inputName = "input." + file.name.split('.').pop(); // Simplifie le nom pour éviter les erreurs de caractères spéciaux
    const outputName = "output.ogg";

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // -c:a libvorbis standard pour le OGG, -q:a 4 qualité moyenne/haute
    await ffmpeg.exec(["-i", inputName, "-c:a", "libvorbis", "-q:a", "4", outputName]);

    const data = await ffmpeg.readFile(outputName);
    
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    const finalName = file.name.substring(0, file.name.lastIndexOf('.')) + ".ogg";
    
    return new File([data.buffer], finalName, { type: "audio/ogg" });
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

            let oggFile = file;
            // Si ce n'est pas déjà du ogg, on convertit
            if (!file.name.toLowerCase().endsWith(".ogg")) {
                oggFile = await convertToOgg(file);
            }

            // Nettoyage du nom pour l'ID (minuscules, pas d'espaces pour Minecraft)
            const cleanName = oggFile.name.replace(".ogg", "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
            const namespace = "soundboard"; // Change ceci si tu utilises un namespace perso

            sounds[cleanName] = {
                category: "record", // ou "master", "music", etc.
                sounds: [`${namespace}:${cleanName}`],
            };

            // Ajout au zip
            soundsFolder.file(`${cleanName}.ogg`, await oggFile.arrayBuffer());

            index++;
            setProgress(Math.round((index / files.length) * 90));
        }

        // Création du sounds.json
        zip.folder(`assets/${"minecraft"}`).file(
            "sounds.json",
            JSON.stringify(sounds, null, 2)
        );

        zip.file(
            "pack.mcmeta",
            JSON.stringify(
                {
                    pack: {
                        pack_format: 15, // Adapte selon la version de MC visée
                        description: "Soundboard Resource Pack Généré",
                    },
                },
                null,
                2
            )
        );

        setProgress(100);
        setStatus("Terminé ! Création du ZIP...");

        const blob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "soundboard_resource_pack.zip";
        a.click();
        setStatus("Téléchargement lancé !");
        
    } catch (e) {
        console.error(e);
        setStatus("Erreur : " + e.message);
        alert("Une erreur est survenue (voir console)");
    } finally {
        button.disabled = false;
    }
};