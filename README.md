# Peppol Hono API

API TypeScript multi-tenant construite avec Hono et oRPC. Elle fournit une
abstraction au-dessus des access points Peppol, avec Dokapi comme premier
adapter, sans déléguer la validation UBL au provider. Les traitements de
webhooks sont exécutés dans un worker BullMQ séparé, avec Redis comme queue
durable.

## Principes de sécurité

- Un compte administrateur crée et configure les entreprises.
- Chaque entreprise utilise ses propres clés API. Seul le préfixe et un hash
  scrypt sont stockés ; la clé complète n’est affichée qu’à sa création.
- Les identifiants Dokapi propres à une entreprise sont chiffrés en
  AES-256-GCM dans PostgreSQL. Une entreprise peut aussi utiliser les
  identifiants Dokapi globaux fournis par l’environnement.
- Pour une entreprise belge, l’EndpointID Peppol est toujours le numéro BCE/KBO
  normalisé : `0208:0732788875`. Un numéro de TVA `BE0732788875` est accepté à
  la création uniquement pour en déduire ce numéro d’entreprise.
- Avant chaque validation ou envoi, l’API parse le XML final et compare
  l’EndpointID du fournisseur à celui de l’entreprise authentifiée. Une
  entreprise ne peut donc jamais émettre au nom d’une autre.
- La validation passe par un service KoSIT compatible, indépendamment du
  provider.

## Démarrage local

```bash
cp .env.example .env
openssl rand -hex 32
# Reporter la valeur dans ENCRYPTION_SECRET et modifier les secrets admin.
docker compose up --build
```

L’API est disponible sur `http://localhost:3001` :

- Scalar : `/`
- OpenAPI : `/openapi.json`
- transport REST/OpenAPI : `/api/*`
- transport oRPC : `/rpc/*`
- webhook Dokapi : `/webhooks/providers/dokapi/events`

Les migrations Drizzle sont appliquées au démarrage quand
`RUN_MIGRATIONS=true`.

Les variables Dokapi peuvent rester vides : aucun provider n’est requis pour
démarrer l’application. Une entreprise configurée pour utiliser les credentials
globaux recevra une erreur `PRECONDITION_FAILED` au moment d’un envoi tant que
`DOKAPI_CLIENT_ID` et `DOKAPI_CLIENT_SECRET` ne sont pas configurés.

Pour développer hors Docker :

```bash
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
# Dans un second terminal
pnpm dev:worker
```

## Flux d’administration

Au démarrage, `ADMIN_EMAIL` et `ADMIN_PASSWORD` créent le compte administrateur
s’il n’existe pas. Une modification du mot de passe dans l’environnement le
met à jour au redémarrage.

1. `POST /api/admin/auth/login` retourne un bearer token opaque.
2. `POST /api/admin/enterprises` crée une entreprise, dérive son EndpointID
   `0208` et retourne sa première clé API une seule fois.
3. `PUT /api/admin/enterprises/{enterpriseId}/provider` bascule entre
   credentials Dokapi globaux et credentials propres chiffrés.
4. Les endpoints `/api/admin/enterprises/{enterpriseId}/api-keys` permettent
   la rotation et la révocation des clés.

Exemple de création :

```json
{
    "name": "Example SRL",
    "vatNumber": "BE0732788875",
    "provider": "DOKAPI",
    "useGlobalProviderCredentials": true
}
```

## API entreprise

Passer la clé dans `x-api-key`.

- `GET /api/enterprise/me`
- `POST /api/documents/generate` : transforme les données structurées en UBL
  avec `@pixeldrive/peppol-toolkit`.
- `POST /api/documents/validate` : contrôle l’EndpointID puis valide via KoSIT.
- `POST /api/documents/send` : contrôle, valide, persiste et transmet via
  l’adapter configuré.
- `GET /api/documents` et `GET /api/documents/{documentId}` : suivi strictement
  limité au tenant.
- `GET /api/participants/lookup?participantId=0208%3A0732788875` : vérifie
  directement l’inscription d’un participant dans le réseau Peppol et retourne
  les types de documents annoncés par son SMP.
- `/api/webhook-endpoints` : configuration et historique des webhooks clients.

Les documents entrants signalés par Dokapi sont téléchargés, vérifiés contre
l’EndpointID destinataire, validés avec KoSIT, persistés puis notifiés à
l’entreprise.

## Lookup des participants Peppol

Le lookup est indépendant des providers configurés. Il applique le mécanisme
officiel SML/SMP actuellement en vigueur :

1. normalisation du Participant Identifier, avec support des formes belges BCE,
   TVA et `0208:<BCE>` ;
2. calcul du nom DNS avec SHA-256 et Base32 ;
3. résolution du record U-NAPTR `Meta:SMP` ;
4. lecture HTTPS du `ServiceGroup` sur le SMP découvert ;
5. extraction des types de documents annoncés.

L’endpoint nécessite une clé API entreprise. Une absence de record DNS retourne
`registered: false`. Une panne DNS, un record non conforme ou une réponse SMP
invalide retourne une erreur de gateway afin de ne pas confondre une panne du
réseau avec une entreprise non inscrite.

`PEPPOL_SML_DOMAIN` permet de sélectionner un autre environnement SML et
`PEPPOL_LOOKUP_TIMEOUT_MS` limite la durée de l’appel externe. Le domaine de
production par défaut est `edelivery.tech.ec.europa.eu`.

Un smoke test vérifie l’entreprise `0732788874` directement sur le réseau de
production. Il est séparé de la suite unitaire pour ne pas rendre les tests
locaux et CI dépendants d’Internet :

```bash
pnpm test:network
```

## Webhooks clients

Chaque endpoint choisit ses événements :

`document.pending`, `document.sent`, `document.delivered`, `document.failed`,
`document.received`, `document.invalid`.

La signature est calculée ainsi :

```text
hex(HMAC_SHA256(webhook_secret, "<timestamp>.<raw_json_body>"))
```

Headers envoyés :

- `x-peppol-delivery` : identifiant stable de livraison pour la déduplication ;
- `x-peppol-event` ;
- `x-peppol-timestamp` ;
- `x-peppol-signature: v1=<signature>`.

Les échecs sont persistés et retentés avec backoff exponentiel. Le consommateur
doit dédupliquer sur `x-peppol-delivery`.

Chaque livraison est d’abord enregistrée dans l’outbox PostgreSQL, puis publiée
dans Redis avec son UUID comme `jobId` BullMQ. Le service `webhook-worker`
continue donc les livraisons et retries lorsque le processus HTTP redémarre ou
est indisponible. Un scanner dans le worker republie périodiquement les lignes
`PENDING` qui n’auraient pas atteint Redis après un crash entre l’écriture SQL
et la publication.

Redis utilise AOF dans Docker Compose et un volume persistant. En production,
l’API et `node dist/worker.mjs` doivent être déployés comme deux processus
indépendants partageant la même base et le même `REDIS_URL`.

Le webhook Dokapi entrant exige `x-webhook-secret`, qui doit correspondre à
`DOKAPI_WEBHOOK_SECRET`.

## Ajouter un provider

1. Implémenter `PeppolProvider` dans `src/providers/`.
2. Ajouter la résolution de credentials dans `src/providers/factory.ts`.
3. Ajouter le provider à l’enum Drizzle et générer une migration.
4. Implémenter son webhook Hono authentifié et idempotent sous
   `src/routes/provider-webhooks/`.

La génération XML, le contrôle tenant, KoSIT, le stockage et les webhooks
clients restent communs et ne doivent pas être réimplémentés dans l’adapter.

## Licence

Ce projet est distribué sous la [licence MIT](./LICENSE).
