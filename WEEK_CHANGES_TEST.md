# Variazioni settimanali — solo app di test

Dopo il caricamento personale di un foglio settimanale o sostitutivo, si apre la dichiarazione di supplementare e assenze. Il file rimane caricato anche se si chiude la finestra. Il comando «Supplementare e assenze» nell'elenco permette di riaprirla e correggerla.

Il lavoratore indica durate in ore/minuti e può dichiarare assenze di una giornata intera o parziali. Sono inclusi i giorni già trascorsi del mese del documento, nella settimana lunedì–domenica relativa al venerdì scelto. I giorni futuri non vengono dichiarati. L'assenza per giornata intera non viene trasformata automaticamente in ore contrattuali.

Le dichiarazioni sono conservate esclusivamente in `test_worker_week_changes`, collegate al documento e protette da RLS. L'amministratore le consulta nel riquadro «Supplementare e giustificativi · prova», in ore decimali. Non aggiornano `hour_budget_days`, budget ufficiali, notifiche o altri registri di presenza.

Non viene usata alcuna API IA. Le modifiche riguardano solo il repository `ferie-facili-test`. La prova con il database è transazionale ed è stata annullata, senza conservare dichiarazioni fittizie.
