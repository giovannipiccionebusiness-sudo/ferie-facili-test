# Ferie Facili — versione di prova

Base: Ferie_Facili_COMPLETO_GitHub.zip. Destinazione autorizzata: esclusivamente il repository ferie-facili-test dell'account giovannipiccionebusiness-sudo.

## Backend

Progetto Supabase: vffnfulorjftailxyghp, nome ferie-facili-test, regione eu-central-1. Schema installato. La chiave nel frontend è pubblicabile; nessuna chiave privilegiata è inclusa.

Correzioni: tipo timestamptz; nome colonna SQL riservato; funzioni privilegiate spostate nello schema privato; un solo amministratore; identità dei documenti immutabile; sostituzione limitata al proprio foglio e alla medesima settimana; controllo del percorso file; venerdì coerente con il mese; autorizzazione consentita solo dopo verifica; pulizia degli upload orfani; lettura notifiche con privilegi del chiamante; registrazione modifiche ai profili.

## Controlli eseguiti

- Sintassi JavaScript app.js e sw.js: PASS.
- Suite security-tests.sql eseguita sul backend remoto, usando esclusivamente identità e metadati fittizi e ROLLBACK finale: PASS.
- Isolamento tra lavoratori, blocco inattivi, impossibilità di autopromozione, unico amministratore, visibilità dell'amministratore, archivio immutabile, verifica distinta dall'autorizzazione, provenienza della verifica, audit e notifiche: PASS.
- Security advisors Supabase dopo le correzioni: nessun avviso restituito.

I test SQL simulano identità autenticate; NON costituiscono ancora prova completa del login via Auth, del trasferimento dei file via HTTP o dei flussi nell'interfaccia.

## Interfaccia

Indicazione TEST; selezione della settimana anche per sostituzioni precedenti; conteggio delle consegne mensili; gestione sede, telefono e disabilitazione lavoratori; storico operazioni; link documenti temporanei; istruzioni iPhone; cache e dati del calcolatore separati dalla versione precedente.

## Da completare prima della consegna finale

1. Creare il repository separato e caricare questi sorgenti.
2. Configurare GitHub Pages solo sul nuovo repository.
3. Configurare Site URL e redirect Auth sul solo indirizzo di prova.
4. Registrare e confermare l'account scelto dall'utente come unico amministratore; promuoverlo dal backend. Non esistono credenziali amministratore predefinite.
5. Verificare login, upload reale di un file fittizio, sostituzioni, definitivo, verifica/autorizzazione e solleciti via interfaccia.
6. Verificare installazione PWA e logout sui dispositivi disponibili.

WhatsApp apre la conversazione e il testo; l'invio richiede l'azione dell'amministratore. Le notifiche sono nella casella dell'app; non sono notifiche push di sistema. Firma e completezza dei moduli vengono verificate manualmente dall'amministratore.

L'app originale calcolatore-ferie non è stata modificata. Questa versione non deve essere trasferita in produzione senza autorizzazione esplicita.
