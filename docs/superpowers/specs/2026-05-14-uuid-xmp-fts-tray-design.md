# Design: UUID Identity, XMP Tags, FTS5 Suche, System-Tray

**Datum:** 2026-05-14  
**Status:** Approved

## Kontext & Ziele

Die App verarbeitet primär PDF-Scans und reichert sie mit KI-Metadaten an. Bisher werden Dokumente per SHA256-Hash identifiziert, Tags nur in SQLite gespeichert und der Archiv-Crawler läuft jede Minute mit vollem File-Read.

**Ziele:**
- Dateien im Windows Explorer oder in der App verschieben/umbenennen ohne Tag-Verlust
- Tags reisen mit der Datei (auch außerhalb der App)
- Schnelle Volltextsuche innerhalb und außerhalb der App
- Crawler performant und manuell triggerbar

## Architektur-Entscheidungen

### 1. Dokument-Identität: UUID statt Hash

Jedes Dokument erhält beim ersten Import eine **UUID v4**, die direkt ins PDF-XMP geschrieben wird. Die UUID ist der Primary Key in der DB.

- Hash bleibt erhalten, aber nur für **Duplikatserkennung** beim Import
- UUID überlebt Renames, Moves, Tag-Updates (Dateiinhalt ändert sich nicht bei Tag-Writes via XMP)
- Multi-Computer-sicher: UUID wird nur geschrieben wenn noch keine vorhanden

### 2. Tags in PDF-XMP (Hybrid)

Tags werden bei jedem Save sowohl in SQLite als auch ins PDF-XMP geschrieben.

```xml
<rdf:Description
  xmlns:dms="http://ns.documents-dms.app/1.0/"
  dms:uuid="550e8400-e29b-41d4-a716-446655440000"
  dms:tags='["Rechnung","Telekom","2024"]'
  dc:description="[erste 500 Zeichen Volltext — für Windows Search]"
/>
```

**Wann XMP geschrieben wird:**
- Erster Import: UUID + Tags nach AI-Analyse
- Manuelle Tag-Änderung durch User
- Migration-Crawler: nur UUID, falls noch keine vorhanden

### 3. Datenbankschema

```sql
-- Haupttabelle (uuid als Primary Key)
CREATE TABLE documents (
  uuid       TEXT PRIMARY KEY,
  hash       TEXT,
  last_path  TEXT NOT NULL,
  tags       TEXT,           -- JSON-Array, Spiegel vom XMP
  metadata   TEXT,           -- sender, date, docType, archivePath, ...
  status     TEXT DEFAULT 'new',
  indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Volltext-Index (FTS5)
CREATE VIRTUAL TABLE documents_fts USING fts5(
  uuid UNINDEXED,
  full_text,
  content='documents',
  content_rowid='rowid'
);
```

**Migration:** Bestehende Einträge (hash-basiert) erhalten eine generierte UUID. UUID wird nachträglich ins jeweilige PDF geschrieben.

### 4. Watcher-Logik (geändert)

Beim `add`-Event:

1. UUID aus PDF-XMP lesen
2. UUID in DB? → Pfad updaten, fertig (kein Hashing)
3. Keine UUID in DB, aber Hash bekannt? → UUID generieren, ins XMP schreiben, DB-Eintrag migrieren
4. Komplett unbekannt + Inbox? → Inbox-Pipeline (UUID als erster Schritt)
5. Komplett unbekannt + außerhalb Inbox? → UUID generieren, als `processed` indexieren

Hashing nur noch bei Inbox-Import (Duplikatcheck) und einmaliger Migration.

### 5. UUID-Crawler (ersetzt Hash-Crawler)

**Wann läuft er:**
- Einmalig beim App-Start
- Manuell triggerbar über UI-Button (disabled während Lauf)
- Status via IPC: `crawler-status: 'running' | 'idle'`

**Pro Datei:** Nur XMP-Header lesen — kein Full-File-Hash.

```
1. XMP lesen → UUID extrahieren
2. UUID in DB + Pfad korrekt? → skip
3. UUID in DB, Pfad veraltet? → Pfad updaten
4. UUID nicht in DB? → Eintrag anlegen (status: processed)
5. Keine UUID? → generieren, XMP schreiben, Eintrag anlegen
```

**Performance:** Bei 2.000 Dateien à 2 MB: ~20 MB Lesevolumen (nur XMP-Header) statt bisher 4 GB pro Minute.

### 6. FTS5 Volltext-Suche

Extrahierter Text (PDF-Parse oder OCR) wird in `documents_fts` gespeichert.

**Such-IPC:**
```
search-documents { query, tags?, dateFrom?, dateTo? }
→ { uuid, last_path, tags, metadata, snippet }
```

SQLite FTS5 `snippet()` liefert Textausschnitt mit Treffer-Highlighting.

**Befüllt wird FTS5:**
- Nach erfolgreicher OCR/AI-Analyse
- Bei manueller Re-Analyse

### 7. System-Tray + Schnellsuche

Ein zweites schlankes Electron-Fenster:

- **Hotkey `Strg+Alt+D`** — öffnet/schließt Suchfenster
- **Tray-Icon** in Windows-Taskleiste (Rechtsklick: Suche, Hauptfenster, Beenden)
- Fenster: immer-im-Vordergrund, 400×500 px, schließt bei Fokus-Verlust

```
┌─────────────────────────┐
│ 🔍 Dokument suchen...   │
├─────────────────────────┤
│ Telekom Rechnung 2024   │
│ 2024-03-15 · Rechnung   │
│ "...Gesamtbetrag 49,99€"│
├─────────────────────────┤
│ Mietvertrag 2023        │
│ 2023-01-01 · Vertrag    │
│ "...Kaltmiete 890€..."  │
└─────────────────────────┘
```

Klick auf Ergebnis → öffnet PDF im App-Viewer, Hauptfenster in den Vordergrund.

### 8. Windows Search Integration

Durch `dc:description` im XMP wird der Volltext automatisch von Windows Search indexiert. Voraussetzung: Archiv-Ordner ist im Windows Search Index enthalten (einmalige User-Einrichtung, Hinweis in Settings-UI).

## Komponenten-Übersicht

| Komponente | Datei | Änderung |
|---|---|---|
| DB Schema | `src/main/db/index.ts` | UUID als PK, FTS5-Tabelle, Migration |
| XMP Service | `src/main/services/xmpService.ts` | Neu: UUID lesen/schreiben, Tags ins XMP |
| Sync Engine | `src/main/services/syncEngine.ts` | Watcher-Logik auf UUID umstellen, Crawler ersetzen |
| Main Process | `src/main/main.ts` | Tray, Hotkey, Crawler-IPC, Search-IPC |
| Search Window | `src/renderer/components/SearchWindow.tsx` | Neu: schlankes Suchfenster |
| Sidebar/Dashboard | bestehende Komponenten | Crawler-Button, Tag-Save triggert XMP-Write |

## Nicht im Scope

- Echtzeit-Sync zwischen mehreren Computern (jeder hat eigene DB)
- Sidecar-JSON-Dateien
- Automatischer Windows-Search-Index-Setup (nur Hinweis in Settings)
