# Presenze definitive, doppia copia Drive e rimozione settimanali — TEST v17

## Comportamento

Le presenze settimanali e le sostituzioni restano fotografie originali: non vengono più scansionate. Per le presenze viene elaborato solo l’ultimo **Invia foglio definitivo** del lavoratore/mese. Non si assume che l’ultimo aggiornamento settimanale sia un mensile completo. Le altre categorie mantengono la scansione precedente.

La scansione parte quando il responsabile apre il definitivo nell’archivio. La copia migliorata viene salvata separatamente; se il definitivo è già PDF, si conserva una seconda copia PDF senza rasterizzarlo. La chiusura viene accodata nel backend e prosegue anche a pagina chiusa. Gli stati compaiono sotto l’anteprima. Per un definitivo respinto non parte la cancellazione.

1. La coda Drive esistente archivia l’originale definitivo.
2. Il nuovo worker verifica metadati, SHA-256 e rilettura dell’originale da Drive.
3. Carica la scansione nella stessa cartella Drive dell’originale, con ID preallocato e persistente. Verifica ID documento, variante, cartella, dimensione, SHA-256 e rilettura dei byte.
4. Soltanto dopo entrambe le verifiche rimuove i settimanali precedenti dello stesso lavoratore e mese, inclusi i relativi fogli sostituiti. Su Google Drive li sposta nel Cestino e verifica lo stato; nel bucket dell’app elimina sorgenti e vecchie derivate settimanali.
5. Rimuove i record settimanali e i loro job Drive con un’operazione DB controllata. Conserva il definitivo, la scansione mensile, gli altri documenti e un registro di chiusura con gli ID rimossi. Le liste amministrative si aggiornano automaticamente.

La rimozione riguarda soltanto righe weekly/replacement con created_at non successivo al definitivo. Gli altri mesi, lavoratori, categorie e precedenti definitivi non vengono eliminati. Una sostituzione più recente che referenzi un settimanale destinato alla pulizia blocca la chiusura; durante la chiusura tali nuove sostituzioni sono impedite con un messaggio che invita a inviare un nuovo definitivo.

## Ripresa e concorrenza

`test_monthly_closures` conserva manifest, ID Google, prove hash, avanzamento per file ed errori. Il worker condivide il lease globale con il worker Drive esistente, evitando che un settimanale venga caricato mentre è in rimozione. Elabora al massimo tre settimanali per esecuzione; il cron riprende quelli successivi. Prima di ogni operazione controlla lease e definitivo più recente. Interruzioni e ritentativi non generano nuove copie. Se manca uno dei due salvataggi verificati non viene iniziata la pulizia.

Le operazioni tra Drive, Storage e database non sono una transazione unica: durante una pulizia interrotta alcuni settimanali possono essere già nel Cestino/rimossi da Storage, con il registro di avanzamento che permette la ripresa. Il definitivo e le sue due copie verificate restano preservati. I file rimossi dal bucket non sono recuperabili direttamente dall’app; le precedenti copie Drive sono nel Cestino finché conservate da Google.

## Backend installato

- `monthly-close.sql`: già applicato al progetto vffnfulorjftailxyghp; non rieseguirlo.
- `supabase/functions/monthly-presence-archive/index.ts`: nuova Edge Function con autenticazione admin/sessione o chiave worker backend. Credenziali OAuth mai esposte al browser.
- Cron `ferie-facili-test-monthly-close`: un tentativo al minuto quando l’originale è archiviato e vi sono chiusure pendenti.
- Tabella con RLS, lettura soltanto per admin attivo; claim/guard/finish eseguibili soltanto dal service_role. Nessun client può marcare coppie verificate o cancellare i documenti.
- Non vengono accodate o cancellate retroattivamente righe dall’installazione SQL. Una chiusura nasce dalla scansione/apertura del definitivo in TEST.
- Repository calcolatore-ferie e worker Drive esistente non modificati. Il backend condiviso cancellerà i settimanali selezionati dalla chiusura anche se consultati dall’altra app.

## Test

- `node tests/monthly-backend.test.cjs` (Node 24+): servizi completamente simulati. Originale pending, rilettura scansione corrotta e lease/definitivo invalidi non causano cancellazioni; entrambe le riletture precedono la pulizia.
- `tests/monthly-security.sql`: fixture esclusivamente fittizie con ROLLBACK. Accodamento, attesa originale, blocco senza prove, invalidazione con nuovo definitivo, catene di sostituzione, cancellazione soltanto dei due settimanali previsti, conservazione del definitivo e di altri mesi/lavoratori/categorie, privilegi frontend bloccati.
- Browser Chromium, dati e backend simulati: settimanale senza alcuna elaborazione; definitivo con scansione automatica, accodamento Drive, anteprima e riuso; layout telefono/computer.
- Edge Function reale: richieste prive di sessione/chiave valida rifiutate; nessun richiamo con chiave worker reale e nessun documento reale elaborato durante i test.
- Il primo trasferimento positivo di un mensile e della sua scansione su Drive con pulizia effettiva richiede una prova completa con documenti fittizi nell’app TEST. Non dichiarato già collaudato end-to-end.
