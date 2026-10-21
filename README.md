# Ferie Facili

Versione completa destinata al repository giovannipiccionebusiness-sudo/calcolatore-ferie.

Origine verificata: ferie-facili-test, commit 5746cad5ddc7767a853038f796ee861358e9faec.
Pubblicazione autorizzata dall'utente il 21 ottobre 2026.

## Pubblicazione
Indirizzo previsto: https://giovannipiccionebusiness-sudo.github.io/calcolatore-ferie/

Il backend già configurato è vffnfulorjftailxyghp. La funzione Drive, le sessioni, i profili e i documenti restano nel backend esistente. Non eseguire di nuovo schema.sql o drive-schema.sql.
Il browser riceve soltanto la chiave pubblicabile di Supabase. Client secret OAuth e refresh token Google restano nel backend.

La callback Google non cambia:
https://vffnfulorjftailxyghp.supabase.co/functions/v1/drive-archive/callback

L'origine CORS consentita è già https://giovannipiccionebusiness-sudo.github.io e comprende entrambi i percorsi. L'archivio Drive esistente conserva gli stessi ID e il nome creato durante il collaudo, così non si creano cartelle duplicate.

Il calcolatore conserva la precedente chiave locale ferie-facili.
Cache PWA e bozze locali della versione completa sono distinte da quelle della versione di prova.
Il manifest mantiene start_url, scope e percorsi icone del calcolatore esistente.

## Ripristino
La versione precedente del repository calcolatore-ferie è al commit aa6e2fc747028bd5a9fc0e7a9946d1c0bb8774a5.
Prima di aggiornare main creare il branch backup-prima-app-completa-2026-10-21 da quel commit, se la testa del repository non è cambiata.
Pubblicare con confronto della testa attesa; non forzare aggiornamenti concorrenti.

## Verifiche di preparazione
Sintassi JavaScript, riferimenti relativi, ambiti PWA, assenza di segreti privilegiati e suite di regressione con dati sintetici.
Resta da verificare il deploy GitHub Pages e la pagina finale dopo l'abilitazione dei permessi sul repository di destinazione.
