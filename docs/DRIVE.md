# Archivio Drive — Ferie Facili TEST

Stato: integrazione automatica non ancora attiva. Attualmente i documenti sono conservati nel bucket privato Supabase private-documents.

## Requisiti di implementazione

- OAuth riservato all'amministratore attivo, con verifica server della sessione e del ruolo.
- Ambito minimo https://www.googleapis.com/auth/drive.file.
- Client secret e refresh token solo nel backend; mai nel repository o nel browser.
- Callback da configurare dopo implementazione; stato monouso con scadenza e PKCE.
- Con drive.file la cartella preparata attraverso ChatGPT non diventa automaticamente accessibile al client dell'app. Deve essere selezionata esplicitamente tramite Picker, oppure creata dall'app stessa.
- Cartelle: sede / lavoratore con identificativo UUID stabile / anno / tipologia / mese.
- Tipologie: Presenze settimanali, Presenze definitive, Richieste ferie, Richieste ROL, Legge 104, Comunicazioni malattia.
- Conservazione di tutte le versioni e delle sostituzioni, senza sovrascritture distruttive.
- Coda persistente con idempotenza per documento, ritentativi e stato visibile all'amministratore.
- Verifica del documento distinta dall'autorizzazione delle richieste.
- Test esclusivamente con documenti sintetici, isolamento utenti e verifica degli esiti.

L'integrazione non deve essere dichiarata operativa prima di un test completo di caricamento, archiviazione e accesso. Il repository originale calcolatore-ferie è escluso dalle modifiche.
