# Scansione automatica nell’archivio — solo TEST (v16)

## Lavoratore

Il caricamento è tornato diretto: foto/PDF → invio con barra di avanzamento e conferma. Non vengono richiesti ritagli, anteprime o conferme aggiuntive. L’originale viene salvato come prima nel bucket privato e segue la coda Drive esistente.

## Responsabile

Documenti → Archivio lavoratori → selezionare il lavoratore. Per le foto nella pagina visualizzata parte automaticamente una coda locale, un file alla volta: riconoscimento dei bordi, correzione prospettica, lieve aumento di contrasto/luminosità preservando i colori, anteprima con proporzioni A4. La copia JPEG viene salvata nel bucket privato `document-scans-test`, con riferimento nella tabella `test_document_scans`. Alle aperture successive viene riutilizzata.

La scheda mostra direttamente la foto migliorata e i comandi **Apri scansione** e **Apri originale**. Se i bordi non sono sufficientemente sicuri, non viene ritagliata la foto: viene migliorata intera e centrata in A4 senza stiramento, con avviso esplicito. I PDF restano originali e non vengono rasterizzati. Un errore nella scansione lascia disponibile l’originale e offre Riprova.

L’elaborazione automatica avviene quando il responsabile apre nell’archivio i documenti del lavoratore, con pagina aperta e connessione disponibile. Non è un’elaborazione server a pagina chiusa. Si applica anche alle foto già presenti. La tabella documenti e l’originale sono immutati: la scansione non è una nuova consegna, non modifica verifiche/autorizzazioni e non invia notifiche. La copia migliorata in questa prova è nel nuovo archivio privato Supabase; su Google Drive continua a essere archiviato l’originale con la procedura esistente.

## Sicurezza

`scan-schema.sql` è già stato applicato al backend vffnfulorjftailxyghp; non rieseguirlo. Tabella e bucket dedicati al TEST, RLS e policy per amministratore attivo. I lavoratori non possono leggere o creare copie migliorate. Nessuna nuova chiave, token o credenziale. Nessuna modifica al repository calcolatore-ferie.

Elaborazione Canvas deterministica locale: niente OCR o generazione di scritte/firme, nessun servizio di elaborazione esterno. La scansione non recupera parti non fotografate, sfocatura o segni illeggibili. I bordi automatici possono essere imprecisi: l’originale resta sempre consultabile.

L’editor interattivo v14 non è più collegato al caricamento. Le eventuali scansioni PDF create precedentemente restano immutate; il relativo originale rimane allegato nel PDF.

## Collaudo con dati fittizi

- Core: validazione quadrilatero, omografia, rilevamento/fallback, campionamento e contrasto.
- Browser reale Chromium: scansione di foto prospettica sintetica con firma fittizia e riferimenti ai bordi; fallback su sfondo incerto senza ritaglio; persistenza e riuso della copia; apertura scansione/originale; blocco elaborazione per lavoratore/logout.
- Flusso completo lavoratore con backend simulato: invio singolo della foto originale, nessun editor o elaborazione aggiuntiva.
- Flusso completo amministratore con backend simulato: archivio per lavoratore, scansione automatica, anteprima, riuso dopo aggiornamento, layout telefono/computer e navigazione gestione.
- `tests/scan-security.sql`: amministratore legge/scrive la copia, lavoratore bloccato su tabella e Storage, originale invariato; fixture di lavoratore/documento/oggetti annullate con ROLLBACK. Il test usa il contesto di autorizzazione admin esistente senza modificarlo: esiste un vincolo di amministratore unico.
- Advisors: nessuna nuova segnalazione di sicurezza; restano le segnalazioni preesistenti sulle tabelle Drive intenzionalmente chiuse e sulla protezione password compromesse.
- Nessun documento reale letto, elaborato o caricato durante le prove. Il collaudo su dispositivo fisico e il trasferimento HTTP effettivo della derivata richiedono una prova con foglio fittizio nell’app TEST.

## Correzione v16

Rilevamento basato su neutralità del colore e soglia adattiva, anziché luminosità fissa. Chiusura dei piccoli vuoti da righe/pieghe e verifica geometrica del candidato. I fogli con angoli sul bordo della foto non sono più scartati automaticamente. Gli originali restano invariati. La colonna algorithm_version distingue le derivate v1: vengono rielaborate automaticamente con algoritmo 2 quando aperte nell’archivio.

Regressione verificata localmente anche sul ritaglio della foto del libro visibile nello screenshot fornito dall’utente, senza caricarlo nel backend. Rimossi tavolo e sfondo esterni principali; non si può recuperare un bordo non presente nello scatto. Aggiunta regressione sintetica per carta in ombra su legno caldo con angoli a filo foto.

La patch incrementale `scan-detector-v2.sql` è già applicata. Le nuove derivate usano auto-v2.jpg, così il browser non riutilizza la precedente immagine dalla cache.

## v17 — solo presenze definitive

Per le presenze, le regole v15/v16 sono sostituite da [MONTHLY-CLOSE.md](MONTHLY-CLOSE.md): scansione solo dell’ultimo definitivo, originale e scansione su Drive, successiva rimozione controllata dei settimanali precedenti. Le altre categorie conservano la scansione automatica.
