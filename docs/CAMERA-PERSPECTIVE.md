# Avviso di prospettiva — prova test 49

La fotocamera conserva il rilevatore dei bordi esistente. Un modulo aggiuntivo valuta il quadrilatero rilevato in coordinate pixel, confrontando lati opposti e angoli. La rotazione del foglio sul piano è accettata; una deformazione prospettica evidente sospende subito l'autoscatto. Dopo 1000 ms persistenti compare un avviso nel riquadro: «Sposta il telefono sopra il foglio. Tienilo parallelo al documento e inquadra tutti e quattro gli angoli».

L'avviso non richiede di chiudere un secondo dialogo e non copre i comandi. Si chiude automaticamente dopo 600 ms di geometria accettabile; la normale stabilità di circa due secondi viene poi richiesta nuovamente prima dell'autoscatto. Fotogrammi senza bordi non vengono classificati come telefono inclinato: mantengono il normale suggerimento per inquadrare il foglio. Lo scatto manuale, la galleria, l'anteprima e la conservazione dell'originale nel PDF restano disponibili.

La stima non misura l'angolo fisico del telefono: una ripresa obliqua con quadrilatero apparentemente rettangolare, fogli curvi o bordi mancanti può non essere riconosciuta. Non vengono fatte ipotesi su un unico formato di carta né richiesti sensori di movimento o nuovi permessi. Il controllo è nella fotocamera interna; non analizza preventivamente foto scelte dalla galleria.

Verifiche: tests/camera-perspective.test.mjs per trapezi, rotazione, bordi mancanti/degeneri, soglia temporale, recupero e reset. Superati anche scanner-core.test.mjs e paper-clean.test.mjs. Prova browser con canvas sintetico passato come stream alla fotocamera: avviso visibile con foglio obliquo, nessun autoscatto mentre rimane obliquo, quindi generazione dell'anteprima PDF dopo la correzione. Fixture riproducibile tests/fixtures/camera-angle-review.html, esclusivamente dati fittizi.

Restano necessarie prove con una fotocamera reale per calibrare contrasto, distanza, ombre e angolazioni. Modifiche soltanto al test, nessuna scrittura al database o ai saldi. La funzione Organizza il tuo riposo rimane da parte e non viene modificata da questo aggiornamento.
