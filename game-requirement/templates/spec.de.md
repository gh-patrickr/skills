---
spec_version: 0.1.0
language: de
game: {{GAME}}
---

# {{GAME}} — so haben wir euer Spiel verstanden

Hallo! Hier steht nochmal alles, was aus euren Ideen geworden ist.
Lest es zusammen durch. Wenn etwas falsch ist, schreibt es unten hin.

## Worum geht es

Ihr rennt mit drei Tieren um die Wette: Lama, Fuchs und Pinguin.
Die Strecke ist in der Wüste. Ihr sammelt Bananen und weicht Kakteen aus.
Ein Lauf dauert etwa 4 Minuten. Danach seht ihr, wer gewonnen hat.

## So spielst du

1. Dein Tier läuft von allein nach rechts.
2. Mit der Rechtstaste wird es schneller.
3. Mit hoch und runter (oder dem Finger) wechselst du die Spur.
4. Bananen geben 1 Punkt.
5. Ein Kaktus beendet die Runde.
6. Nach 3 Runden kommt das Ergebnis. Mit "Nochmal" startest du neu.

## Was im Spiel drin ist

| ID | Was du im Spiel merkst | Wichtig? |
| --- | --- | --- |
| F-001 | Dein Tier läuft von allein nach rechts. Mit der Rechtstaste wird es schneller, mit hoch und runter wechselst du die Spur. | Muss |
| F-002 | Eine Banane gibt 1 Punkt und macht ein Geräusch. | Muss |
| F-003 | Ein Kaktus beendet die Runde. Du kannst sofort neu starten. | Muss |
| F-004 | Nach 3 Runden siehst du, wer vorne ist, deine Punkte und "Nochmal". | Muss |
| F-005 | Dein Level und deine besten Punkte bleiben gespeichert. | Sollte |
| C-001 | Es gibt Lama, Fuchs und Pinguin. | Muss |
| C-002 | Der Pinguin ist am schnellsten, dann der Fuchs, dann das Lama. | Sollte |
| N-001 | Auf dem Tablet klappt alles mit dem Finger. Die Knöpfe sind groß genug. | Muss |
| N-002 | Musik läuft, wenn die Runde startet. Du kannst sie jederzeit ausmachen. | Sollte |
| N-003 | Das Spiel läuft flüssig, auch auf einem älteren Tablet. | Sollte |
| S-001 | Keine Werbung, keine Anmeldung, keine fremden Seiten. | Sollte |

## So prüfen wir, dass es klappt

Das sind die Checks, die wir vor dem Zeigen laufen lassen:

- AC-001: Mit "rechts" bewegt sich dein Tier nach vorne.
- AC-002: Eine Banane gibt genau 1 Punkt und ein Geräusch.
- AC-003: Ein Kaktus beendet die Runde.
- AC-004: Nach 3 Runden kommt das Ergebnis mit 3 Tieren.
- AC-005: Die Tiere heißen Lama, Fuchs und Pinguin.
- AC-006: Auf dem Tablet sind alle Knöpfe mit dem Finger erreichbar.
- AC-007: Der Pinguin ist schneller als der Fuchs und der Fuchs schneller als das Lama.
- AC-008: Nach dem Neuladen sind deine besten Punkte noch da.
- AC-009: Der Ton-Knopf macht die Musik aus, und das bleibt so.
- AC-010: Das Spiel lädt nichts von fremden Seiten und zeigt keine Werbung.
- AC-011: Das Spiel läuft mit 60 Bildern pro Sekunde.

## Was erstmal nicht drin ist

- Mehr als ein Level. Ihr habt gesagt: "Mehr Level später, erstmal eins."
- Zusammen an einem Gerät spielen.
- Eine Bestenliste im Internet. Dafür bräuchten wir Konten und Server.
- Tiere selbst anmalen oder aussuchen.

## Das haben wir angenommen

| ID | Was wir angenommen haben |
| --- | --- |
| AD-01 | Keine Werbung, keine Konten, keine fremden Seiten. |
| AD-02 | Das Spiel ist 960×600 groß und läuft mit 60 Bildern pro Sekunde. |
| AD-03 | Alles im Spiel ist auf Deutsch. |
| AD-04 | Eine Strecke mit 3 Runden pro Lauf. |
| AD-05 | "Der Pinguin ist der schnellste" heißt: ein bisschen schneller, nicht unschlagbar. |
| AD-06 | Nach einem Kaktus startest du von vorne, nicht vom letzten Level. |

## Bitte bestätigen

Kreuzt an, was stimmt. Schreibt dazu, was fehlt oder falsch ist.

- [ ] Das Spiel ist so, wie wir es wollten.
- [ ] Die Tiere heißen wirklich Lama, Fuchs und Pinguin.
- [ ] 3 Runden pro Lauf sind richtig.
- [ ] Bananen sammeln und Kakteen ausweichen ist die ganze Idee.
- [ ] Auf dem Tablet mit dem Finger spielen ist wichtig.
- [ ] Die Fragen unten haben wir beantwortet.

Das ist falsch: ____

Das fehlt noch: ____
