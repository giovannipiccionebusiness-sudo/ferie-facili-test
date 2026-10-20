# Archivio Drive — Ferie Facili TEST

Stato: codice installato sul backend vffnfulorjftailxyghp; attivazione Google e collaudo completo ancora da eseguire. NON dichiarare operativo prima di upload sintetico, archiviazione e lettura di ritorno riusciti.

## Requisiti
- OAuth solo per amministratore attivo, sessione validata server con getUser e auth.sessions.
- Ambito minimo https://www.googleapis.com/auth/drive.file.
- Client secret solo nei Secrets Supabase; refresh token solo nella tabella backend drive_credentials, senza privilegi per anon/authenticated e con RLS deny by default. Nessun token Google viene restituito al browser.
- Callback backend, stato monouso con scadenza di 10 minuti e PKCE S256; ruolo e sessione verificati anche alla callback.
- Cartella creata dall'app: Documenti lavoratori - Ferie Facili TEST. La cartella preparata attraverso ChatGPT non è automaticamente accessibile al client drive.file.
- Struttura: sede / nome lavoratore [UUID stabile] / anno / tipologia / mese. La chiave persistente della cartella usa l'UUID e non il nome.
- Tipologie: Presenze settimanali, Presenze definitive, Richieste ferie, Richieste ROL, Legge 104, Comunicazioni malattia.
- Tutti i documenti e tutte le sostituzioni sono file distinti; nome file con UUID del documento, nessuna sovrascrittura.
- Coda persistente per document_id unico, ID Drive preallocato e persistito prima dell'upload, lease globale contro elaborazioni concorrenti, ritentativi con backoff fino a 10 fallimenti; Riprova dal pannello admin.
- Cartelle con ID preallocato persistente; nessuna duplicazione dopo timeout della creazione.
- Prima dello stato Archiviato: verifica metadati, cartella, dimensione e SHA-256 dei byte riletti da Drive.
- Verifica del documento distinta dall'autorizzazione delle richieste: il flusso esistente non viene modificato.
- Solo documenti fittizi nei test. Il repository calcolatore-ferie è escluso.

## Attivazione da completare
1. Nel client OAuth Google di tipo Applicazione web, abilitare Drive API e registrare esattamente:
   https://vffnfulorjftailxyghp.supabase.co/functions/v1/drive-archive/callback
2. In Supabase > Edge Functions > Secrets inserire GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET.
   Non mettere il secret nel frontend, in GitHub o in chat. Non usare la configurazione Google Auth per il login Supabase: questo collegamento riguarda l'archivio Drive.
3. Accedere come amministratore all'app TEST, aprire Documenti e premere Collega Google Drive.
   Completare il consenso Google, poi tornare all'app e premere Aggiorna stato.
4. L'app crea la propria cartella TEST durante la prima archiviazione. Non occorre allargare lo scope a tutto Drive.
5. Caricare un PDF o una foto contenente esclusivamente dati inventati dall'account lavoratore di prova.
6. Attendere il cron (un documento al minuto), oppure usare Elabora prossimo documento dopo aver verificato che la coda contenga solo file sintetici.
7. Verificare Archiviato e verificato, struttura delle cartelle, apertura sul Drive dell'amministratore e conservazione di entrambe le versioni dopo una sostituzione.
8. Provare un secondo lavoratore di test, un definitivo e le altre tipologie; verificare che ogni lavoratore veda soltanto i propri documenti.

Il consenso Google deve essere eseguito dall'amministratore; non è sostituibile dal collegamento Drive di ChatGPT. Se l'app OAuth è in modalità Testing, verificare utenti di test e durata dei refresh token nelle impostazioni Google. Una riconnessione deve usare lo stesso account Google dell'archivio: con un altro account i vecchi ID potrebbero non essere accessibili; l'errore resta visibile, senza creare copie alternative.

## Sorgenti e deploy
- supabase/functions/drive-archive/index.ts: API amministratore, OAuth callback e worker.
- drive-schema.sql: DDL incrementale dopo schema.sql, già applicato al progetto TEST. Non rieseguirlo su uno schema che lo contiene.
- drive-security-tests.sql: test con metadati fittizi e ROLLBACK. Non prova trasferimenti HTTP o consenso Google.
- Il cron ferie-facili-drive-archive richiama private.schedule_drive_archive ogni minuto. Se non esiste un collegamento Google, non invia chiamate.
- Funzione con verify_jwt=false perché la callback Google non porta un JWT Supabase. Ogni rotta applica la propria autenticazione: admin/sessione, stato OAuth o chiave worker backend.
- La chiave worker generata nel database non è nel repository. Il backend conserva i sorgenti dei documenti nel bucket privato Supabase.
- Il pannello mostra i 200 caricamenti più recenti; il cron elabora tutta la coda.
- Un file o una cartella rimossi manualmente dall'archivio generano errore visibile; non vengono sovrascritti o ricreati con un'identità diversa.
- Il lease scade dopo 10 minuti in caso di interruzione del worker.

## Verifiche eseguite
- Suite SQL sintetica: PASS per enqueue/idempotenza, isolamento lavoratori, visibilità admin, segreti/RPC backend, lease esclusivo, retry/backoff, stato finale, rifiuto stati OAuth inesistenti/scaduti e sessioni non amministratore.
- Sintassi JavaScript frontend: PASS.
- Edge Function installata e chiamata via HTTP: richieste senza sessione 401, chiave worker inventata 401, callback con stato inventato 400.
- La prima prova HTTP ha rilevato un nome variabile che oscurava URL; corretto e verificato con le tre risposte sopra.
- Prova positiva di consumo stato legato a una sessione admin: non eseguita, nessuna sessione admin attiva disponibile al momento del test.
- Collaudo upload reale sintetico -> Drive -> rilettura: NON ESEGUITO, richiede configurazione/consenso Google dell'amministratore. Non sono stati trasferiti documenti reali.
- La revisione automatica ha rifiutato una chiamata con la chiave reale del worker perché avrebbe potuto elaborare documenti privati; non è stata eseguita.
- Advisors: nessuna segnalazione di accesso ai segreti; INFO sulle quattro tabelle backend senza policy (blocco intenzionale); avviso Auth preesistente sulla protezione password compromesse disabilitata.
