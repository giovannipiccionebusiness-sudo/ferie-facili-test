# Presenze giornaliere e settimanali — solo app di test

Il riquadro «Le presenze, giorno per giorno» permette di scegliere un giorno trascorso, inserire supplementare e giustificativi o confermare «Nessuna variazione». Non serve aver già caricato un foglio. Il riepilogo settimanale riprende gli inserimenti dal lunedì alla domenica, anche a cavallo di mese/anno. I giorni futuri sono esclusi dal salvataggio. Il caricamento settimanale o sostitutivo apre ancora il riepilogo, limitato al mese del documento.

I dati giornalieri sono canonici: una riga per lavoratore e giorno. Una conferma settimanale aggiorna le stesse righe in una transazione e controlla le versioni per evitare sovrascritture fra dispositivi. Lo storico delle dichiarazioni legate ai documenti è conservato. Nel riepilogo amministratore i dati giornalieri prevalgono sui precedenti riepiloghi, evitando duplicazioni. Le durate sono in minuti interi, visualizzate in decimali: 1:30 = 1,50; 3:40 = 3,67. L’assenza di intera giornata resta tale, senza inventare ore contrattuali.

## Promemoria di prova

Le fasce sono gestite esclusivamente dall’amministratore nel riquadro «Fasce orarie e promemoria · prova». Per ogni lavoratore si impostano la decorrenza e fino a due fasce ordinate per giorno. Giorni senza fasce sono riposi. La copia lunedì → martedì–venerdì velocizza gli orari ripetuti. Sono supportati cambi futuri, versioni concorrenti e turni notturni; ogni fascia deve durare almeno 30 minuti e non sovrapporsi ad altre.

Il lavoratore non imposta giorni, orari o attivazione del promemoria; il vecchio setter delle preferenze è revocato anche nel database. Deve solo consentire gli avvisi sul telefono. Nessuna fascia reale viene inventata: l’amministratore deve salvarla prima che possano partire gli avvisi.

Il cron dedicato controlla ogni minuto e registra un solo avviso, da 30 minuti prima dell’ultima uscita fino alla fine del turno. Per turni che terminano dopo mezzanotte, la dichiarazione riguarda il giorno di inizio. Si usa Europe/Rome e l’anticipo è calcolato sul timestamp di fine turno. Non sollecita giornate già compilate. Il venerdì registra invece il riepilogo, se non ancora confermato o modificato successivamente. Le notifiche restano nella campanella di prova; selezionarle apre il giorno o la settimana. L’invio al telefono usa esclusivamente sottoscrizioni con app_scope=test e chiavi cifrate valide. Il sender ricontrolla la validità della fascia prima di inviare, anche se un turno è stato modificato o disattivato. I vecchi promemoria per caricare la foto del foglio restano indipendenti.

Il service worker di test interpreta solo collegamenti relativi alla propria app; le date sono validate e il database usa sempre il lavoratore autenticato. Il collegamento resta in attesa se è necessario accedere. L’app ufficiale, i suoi avvisi e il registro hour_budget_days non sono modificati. Nessuna API IA è utilizzata.

## Struttura e verifica

Nuove tabelle test_daily_presence, test_daily_preferences, test_presence_week_confirmations, test_daily_notices e test_daily_deliveries. RLS e privilegi impediscono letture tra lavoratori e scritture dirette; i salvataggi passano da RPC invoker che chiamano implementazioni private con controllo del lavoratore attivo. L’amministratore può leggere i dati per verifica, senza approvazione automatica.

SQL di installazione: supabase/test-daily-presence.sql, poi test-daily-rpc-wrappers.sql e test-daily-week-confirmation.sql. Scheduler: supabase/test-daily-scheduler.sql. Funzione separata: supabase/functions/test-daily-presence-push/index.ts. Nessun dato o promemoria dimostrativo persistito dalle prove.

Test: parsing, confini mese/anno, versioni, giorni futuri, assenze, RLS, scritture vietate, riuso settimanale, deduplicazione, orario, riposi e isolamento della produzione. Verifica browser con dati fittizi: giornata → riepilogo → decimali amministratore, apertura dalla campanella e da URL, preferenze e «Nessuna variazione». La ricezione effettiva sul telefono dell’utente richiede una verifica sul suo dispositivo con i permessi attivati.

## Fasce amministratore

Installazione successiva alle precedenti: supabase/test-admin-shifts.sql e supabase/test-shift-window.sql. Tabella test_worker_shifts con RLS, lettura amministratore e del solo lavoratore interessato; salvataggio attraverso RPC con controllo dell’amministratore attivo e delle versioni. Test aggiuntivi: tests/shift-core.test.mjs e supabase/tests/test-admin-shifts.sql. Nessun orario di lavoratori reali inserito nelle verifiche, tutte annullate tramite rollback.
