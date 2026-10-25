# Notifiche push — solo ferie-facili-test

Le notifiche richiedono un consenso esplicito sul dispositivo. iPhone/iPad richiedono iOS/iPadOS 16.4 o successivo e l'apertura dalla schermata Home. Nessuna richiesta di permesso viene aperta automaticamente.

## Prova

Accedere alla versione di test, premere **Sì, attiva gli avvisi**, consentire e premere **Invia notifica di prova**. Quest'ultimo tasto contatta soltanto il dispositivo dell'account corrente, con un limite di una prova al minuto. I messaggi sullo schermo sono generici e non includono nomi, tipi di documento o dati sanitari.

Gli account in attesa possono attivare le notifiche prima dell'abilitazione. L'avviso di abilitazione riguarda il passaggio successivo da non attivo ad attivo. Gli account già attivi non ricevono un avviso retroattivo.

## Automazioni

- Venerdì tra le 17:00 e le 20:00, fuso Europe/Rome: un promemoria per dispositivo se manca il foglio della settimana e non esiste il definitivo del mese.
- Ultimo giorno del mese tra le 18:00 e le 20:00: un promemoria se manca il definitivo.
- Controllo ogni minuto, con coda univoca per dispositivo/evento e massimo tre tentativi. Prima dell'invio si ricontrollano account, sottoscrizione e documenti per evitare solleciti divenuti inutili.
- L'uscita dall'account annulla la sottoscrizione sul telefono; gli endpoint scaduti vengono rimossi quando il servizio push restituisce 404/410.

## Backend

Edge Function `test-web-push`, tabelle `test_push_config`, `test_push_subscriptions`, `test_push_queue` e cron `lavoro-facile-test-push`. Le tabelle hanno RLS e nessun privilegio per anon/authenticated: l'accesso avviene solo tramite funzione server, che verifica l'utente con Supabase Auth. Il dispatcher richiede un token casuale server; la chiave pubblicabile non autorizza gli invii.

La coppia VAPID viene generata al primo consenso e conservata solo nel backend. Nessuna chiave privata entra nel repository o nel browser. Il payload push è vuoto: il service worker del test mostra il messaggio generico. La chiave pubblica è restituita solo a un utente autenticato.

La versione ufficiale non include questi controlli o handler push. Il backend è condiviso: le automazioni considerano esclusivamente sottoscrizioni attivate dall'interfaccia test.

## Verifiche

Test SQL con account e documenti fittizi, annullati con rollback: account non attivo, abilitazione, duplicati, calendario settimanale/mensile, definitivo già caricato e privilegi client. Test browser con servizio push simulato: consenso soltanto al clic, attivazione, prova sul proprio dispositivo e annullamento al logout. API effettiva: richieste senza sessione e dispatcher con token errato restituiscono 401. La ricezione su Android/iPhone richiede la prova reale del proprietario del dispositivo.

## Attivazione semplificata

Il riquadro offre “Sì, attiva gli avvisi” e “Non ora”. La scelta di rimandare è conservata per l'account nella sessione del browser. Chi chiude la richiesta senza bloccare gli avvisi può riprovare senza essere mandato alle impostazioni. Se il permesso è negato, un pulsante apre una guida a tre passaggi con icone, distinta per Android/browser e iPhone. Su iPhone non installato viene spiegata prima l'aggiunta alla schermata Home. “Ho fatto, ricontrolla” aggiorna lo stato senza aprire automaticamente richieste di permesso.
