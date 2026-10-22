# Menu lavoratore compatto — anteprima TEST

Quattro sezioni richiudibili: Presenze, Altri documenti, I miei caricamenti, Messaggi. Tutte inizialmente chiuse; una sola aperta alla volta. Mese condiviso sempre visibile, conteggio caricamenti e messaggi non letti, elenchi inizialmente limitati a cinque righe.

La guida apre automaticamente la sezione del campo evidenziato; il recupero delle foto del congedo apre Altri documenti. Dopo un invio riuscito si apre I miei caricamenti. L'intestazione viene ridotta per i lavoratori autenticati. Logo Dussmann conservato.

È una copia della versione pubblica aggiornata soltanto nel repository TEST. Bozze, selezione della fotocamera, cache e stato d'installazione sono separati dalle rispettive chiavi della versione definitiva. Backend condiviso come prima; nessuna modifica a database o funzioni. Usare documenti fittizi.

Verifica browser con Playwright e Chromium: PLAYWRIGHT_MODULE=<percorso a playwright> CHROMIUM_PATH=<eseguibile Chromium> node tests/worker-menu.browser.cjs

Il test intercetta tutte le richieste e usa account, caricamenti e messaggi fittizi. Controlla menu chiuso, apertura esclusiva, modulo congedo, paginazione, conteggio non letti, guida e overflow su smartphone e desktop.
