# Scansione documenti A4 — solo TEST

Dopo la scelta di un JPEG/PNG/WebP, l'app apre un editor locale. Il rilevamento dei bordi è una proposta basata sul contrasto: con sfondi chiari, ombre o fogli parziali occorre correggere i quattro angoli. Si può ruotare la foto, scegliere A4 verticale/orizzontale e mantenere il colore o aumentare moderatamente contrasto e luminosità in grigio. È pensato per fogli A4: controllare orientamento, ritaglio, proporzioni e leggibilità nell'anteprima.

“Anteprima A4” prepara una pagina PDF. “Usa PDF A4” conferma e avvia il normale caricamento. “Usa foto originale” invia la foto senza elaborazione. “Annulla” non invia alcun documento. I PDF scelti dal lavoratore passano direttamente al caricamento senza modifiche.

La scansione applica una trasformazione prospettica deterministica; nessun OCR, ricostruzione di testo o servizio esterno. Non corregge sfocatura, parti tagliate nello scatto, ombre forti o pieghe. La resa in grigio è facoltativa e può ridurre i segni molto chiari: controllare sempre firme e scritte prima di confermare.

## Originale e recupero

Il PDF contiene una sola pagina A4 e il file originale esatto come allegato PDF, non come seconda pagina. Per estrarre l'allegato usare un lettore che supporti gli allegati; alcune anteprime mobili non li mostrano. La foto originale viene anche salvata nella bozza temporanea locale prima dell'editor: se Android ricarica la pagina, può essere ripresa come foto originale. Dopo la conferma, la bozza contiene il PDF e conserva lo stesso UUID. Le limitazioni preesistenti di IndexedDB/spazio disponibile restano applicabili.

Il PDF comprensivo dell'originale deve rispettare il limite di 12 MB: altrimenti l'editor propone di usare l'originale o una foto più piccola. Il server riceve il PDF accettato attraverso lo stesso bucket privato, le stesse policy e la coda Drive esistente. Nessun nuovo accesso pubblico, secret o modifica del database. Nessuna modifica a calcolatore-ferie.

## Verifiche con dati fittizi

- `node tests/scanner-core.test.mjs`: convessità, omografia, rilevamento/fallback, ricampionamento, grigio, struttura PDF.
- Browser Chromium con viewport 390×844 e 1280×900: editor, angoli, rilevamento automatico su foto sintetica prospettica, rotazione, anteprima, colore/grigio e invalidazione, originale e annullamento.
- Parsing e rendering PDF: singola pagina A4 595,28 × 841,89 pt; confronto dei byte dell'allegato con la foto scelta: identici. Testo ai bordi e firma fittizia inclusi nella scansione.
- Flusso lavoratore con backend completamente simulato: nessun trasferimento prima della conferma, invio singolo PDF con percorso/metadati corretti, nessun invio in caso di annullamento.
- Nessun documento reale letto o caricato. Il collaudo fisico su fotocamere Android/iPhone e il trasferimento effettivo di un PDF sintetico nel proprio account restano da eseguire nell'app TEST.
