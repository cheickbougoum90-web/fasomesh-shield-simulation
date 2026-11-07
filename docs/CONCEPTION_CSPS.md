# FasoMesh Shield — Note de conception CSPS (Phase 0)

> Périmètre : **coordination sanitaire, centrée sur le CSPS**.
> Démonstration logicielle : aucune radio physique, toutes les transmissions
> Mesh sont **simulées** ; aucune donnée médicale réelle ; aucune fonction de
> diagnostic ; ce n'est pas un dispositif médical certifié.

---

## 1. Audit de départ (exécuté, pas déduit)

Base de départ = archive fournie `fasomesh-shield.zip` (82 fichiers, 11 tests),
déjà présente dans le dépôt au commit `abc3c3f`.

```
$ npm run typecheck → tsc --noEmit            TSC=0
$ npm test          → Test Files 18 passed    Tests 171 passed
$ npm run build     → ✓ built in 1.60s        BUILD=0
```

Conservés sans modification : moteur Mesh (`mesh/*`), routage, files,
pertes/retransmissions, contrat de livraison, persistance locale, console de
supervision, couche `src/policy/`, tests existants (171).

## 2. Acteurs fonctionnels (§3)

| Espace | Rôles | Droits principaux (déjà au catalogue) |
|---|---|---|
| **CSPS** (centre de gravité) | `health_agent`, `health_manager` (**nouveau** : responsable) | `care.create`, `care.readOrg`, `care.evacuate`, `alert.raise`, `message.*`, `org.members.read`, `org.manage` (responsable), `audit.read` |
| **Centre de référence** | `health_center_operator`, `hospital_operator` | `care.readInbox`, `care.respond`, `message.*` |
| **Hub** | `operator` | `hub.alert.read`, `hub.categorize`, `hub.stats`, `journal.read` |

Hors périmètre de ce chantier (déjà présents dans la base de départ, tests
intangibles) : espaces citoyen, ONG, groupes familiaux. **Ils ne sont ni
développés ni étendus** ; ils restent en place uniquement pour ne supprimer
aucun test existant (règle non négociable 4).

## 3. Entités

```
Organization { kind, region, district, locality, address, services[], availability, nodeId }
  └─ Membership { userId, orgId, role, active }        ← gestion locale par le responsable
CareRequest  { caseRef, kind: reference|evacuation|advice, priority, category,
               motif, description, signes, vitals{temp,bp,hr,rr,spo2}, firstAid,
               complementary, location, targetOrgId, transportNeeded,
               oxygenNeeded, teamNeeded, logisticsInstructions,
               status, events[], justification, transportDeliveryId }
Alert        { category: 7 catégories sanitaires, priority, deliveryId, ... }
Conversation { ..., careRefId }                        ← fil rattaché à un dossier
Annuaire     = Organization enrichi (§9), lecture seule côté CSPS
```

Aucun champ nominatif : `caseRef` (`DOS-2026-0142`) est le seul identifiant du
dossier. Le nom du patient n'est jamais demandé, stocké, affiché.

## 4. Deux machines à états, strictement indépendantes (§6)

**A. Technique (moteur, inchangée)** — `DeliveryStatus` :
`created → accepted_local → routing → queued → delivered | unconfirmed | failed`

**B. Sanitaire (suivi humain)** — `CareStatus` :

| §6 (cahier) | État applicatif | Remarque |
|---|---|---|
| DRAFT | `draft` *(ajouté)* | brouillon, jamais transmis |
| SUBMITTED | `created` puis `sent` | création locale puis confié au moteur |
| RECEIVED_BY_CENTER | `received` | **couplage automatique #2** |
| ACKNOWLEDGED | `acknowledged` | acte d'opérateur |
| ACCEPTED / REJECTED | `accepted` / `rejected` | refus ⇒ justification obligatoire |
| INFORMATION_REQUESTED | `information_requested` *(ajouté)* | le centre redemande |
| TRANSFER_PREPARING | `in_progress` | transfert préparé |
| IN_TRANSIT | `in_transit` *(ajouté)* | en cours d'évacuation |
| ARRIVED | `arrived` *(ajouté)* | arrivée au centre |
| RESOLVED | `resolved` | clôture avec compte rendu |
| CANCELLED | `cancelled` *(ajouté)* | abandon par le CSPS |

Seuls **deux couplages automatiques** existent : `sent` (confié au moteur) et
`received` (transport `delivered`). Tout le reste exige un acte d'opérateur.
Une réception technique **ne vaut jamais** acceptation médicale.

## 5. Flux d'une demande de référence

```
CSPS (formulaire 3 volets) → created → [moteur] → sent → … → received
  → centre : acknowledged → accepted → in_progress → in_transit → arrived → resolved
                              ↘ rejected (motif obligatoire)
                              ↘ information_requested → (réponse CSPS) → acknowledged
  CSPS : draft → created | cancelled à tout stade avant clôture
```

Le Hub n'est **jamais** passage obligatoire : une route directe ou
multi-saut entre CSPS et centre est utilisée en priorité (testé par
`hubRelay.test.ts`, mode `terminus`).

## 6. Plan de développement (§17)

| Phase | Contenu | Livrable |
|---|---|---|
| 0 | Audit, conception | ce fichier |
| 1 | Rôle responsable, établissements enrichis, seed sanitaire, tableau de bord CSPS | `Dashboard.tsx`, `seedData.ts` v3 |
| 2 | Module de demande (3 volets, validation par priorité), machine sanitaire étendue, fiche dossier | `CareNew`, `CareDetail`, `domain/care.ts` |
| 3 | Messagerie CSPS↔centre↔Hub, fil rattaché au dossier, notifications | `sendMessage`, `Conversation` |
| 4 | Boîte de réception du centre (filtres), actes, disponibilité/moyens, orientation Hub | `Care.tsx`, `HubSpace.tsx` |
| 5 | Supervision : routes affichées, pannes, files, reprise | `Track.tsx`, console |
| 6 | Rapports + export CSV, journal d'activité, scénarios A→M, documentation | `Reports.tsx`, `cspScenarios.test.ts`, `DEMO_CSPS.md`, `RAPPORT_CSPS.md` |

Après chaque phase : `npm run typecheck`, `npm test`, `npm run build`, commit.
Aucun test existant n'est supprimé ni affaibli.
