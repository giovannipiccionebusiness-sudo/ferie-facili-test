# Ferie Facili — installazione completa

## Stato del progetto
L'app include calcolatore, autenticazione, caricamento privato di moduli firmati, aggiornamenti settimanali, sostituzioni, foglio definitivo, verifica e rifiuto, autorizzazione distinta per ferie e ROL, elenco mancanti, messaggi nell'app e preparazione di WhatsApp. **Non è operativa finché non configuri Supabase.** Non è integrata con Google Drive. Le notifiche sono nella casella interna dell'app, NON notifiche push del sistema operativo; i messaggi WhatsApp richiedono l'invio manuale. Non usare il servizio con documenti reali finché non sono stati verificati privacy, ruoli e configurazione.

## 1. Backend Supabase
1. Crea un progetto su https://supabase.com e annota **Project URL** e **anon/public key**. Non usare mai la `service_role` key nel sito.
2. Nel SQL Editor esegui `schema.sql` in un progetto vuoto. Il codice crea tabelle, bucket privato e policy RLS.
3. In Authentication > Providers abilita Email, conferma email e, se possibile, disabilita iscrizioni pubbliche dopo l'onboarding. In Authentication > URL Configuration imposta l'indirizzo GitHub Pages come Site URL e Redirect URL.
4. Inserisci URL e anon key in `config.js`.
5. Pubblica tutti i file nella **radice** del repository GitHub Pages (non caricare lo ZIP come singolo file).
6. Registrati dall'app come primo utente. Conferma la tua email.
7. Nel SQL Editor promuovi **solo il tuo account**:
   `update public.profiles set role='admin', active=true, full_name='Responsabile' where id=(select id from auth.users where email='TUA_EMAIL');`
8. Esci e rientra. Ora puoi abilitare gli altri utenti, assegnando N153 o N148. I lavoratori si registrano con email/password e sono inattivi finché non li abiliti.
9. Per WhatsApp, aggiungi il numero con prefisso internazionale (es. 39...) nel campo `phone` del profilo, usando il Table Editor Supabase. Verifica che l'uso del numero sia autorizzato.

## 2. Sicurezza e privacy
- I documenti sono in un bucket **privato** e vengono aperti con link temporanei di 90 secondi.
- I lavoratori vedono solo i documenti associati al proprio account; l'amministratore vede quelli di tutti. I controlli sono nelle policy RLS, non soltanto nell'interfaccia.
- Le foto e i PDF possono contenere dati personali e, per malattia e Legge 104, dati delicati: acquisire soltanto quanto necessario, senza diagnosi. Definire informativa, ruoli privacy, conservazione, eventuale DPA, backup e cancellazione prima dell'utilizzo reale.
- Le immagini caricate non sono analizzate automaticamente: la verifica di firma e completezza è **manuale**.
- L'account admin va protetto con password robusta e, se disponibile, MFA. Per un utilizzo aziendale è raccomandato test di sicurezza indipendente.
- Il progetto Supabase gratuito può avere limiti, sospensioni o costi futuri: controlla il piano prima dell'attivazione.

## 3. Flusso
- Ogni venerdì: il lavoratore carica una nuova foto dello **stesso foglio cartaceo** aggiornato. `Sostituisci` collega il nuovo caricamento al precedente della settimana.
- A fine mese: il lavoratore carica il foglio completo e firmato. Il responsabile lo verifica. Le foto settimanali rimangono come storico temporaneo; la cancellazione automatica non è ancora implementata.
- Per ferie e ROL: `Documento verificato` e `Richiesta autorizzata` sono due operazioni diverse.
- Legge 104: l'app gestisce soltanto ricezione/verifica del modulo; la valutazione giuridica non è automatizzata.
- Malattia: caricare solo documenti amministrativi necessari, senza diagnosi.
- `Sollecita mancanti`: seleziona un venerdì, controlla i mancanti, invia messaggi nell'app e/o apre WhatsApp. WhatsApp non certifica l'avvenuto invio.

## 4. Limiti ancora da completare
- **Google Drive**: non integrato; l'archivio operativo è Supabase Storage. Serve un'integrazione server-side autorizzata per la sincronizzazione Drive, mai credenziali Drive nel repository.
- **Push di sistema**: non implementate. Ci sono messaggi nell'app visibili quando il lavoratore la apre.
- **WhatsApp automatico**: non implementato; l'invio è manuale. Per l'automazione serve un provider WhatsApp Business ufficiale e consenso/base giuridica appropriati.
- **Politica di eliminazione** delle foto settimanali: da concordare e automatizzare.
- **Solleciti**: sono manuali dal pannello, non inviati automaticamente il venerdì.
- **Autorizzazioni Legge 104**: richiedono verifica normativa e gestione separata, non sono trattate come autorizzazioni discrezionali di ferie.
- Il calcolatore originale è conservato, ma la somma di ferie e ROL va verificata in base alle unità del cedolino e al CCNL prima dell'uso come dato ufficiale.
