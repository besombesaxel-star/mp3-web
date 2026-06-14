# MP3 Web

Application Next.js pour lire, uploader et organiser une bibliotheque MP3.

## Lancer l'app

```bash
npm install
npm run dev
```

Ensuite ouvre `http://localhost:3000`.

## Stockage

L'app sait fonctionner de 3 facons:

- mode local: les nouveaux fichiers vont dans `public/audio` et `public/cover`
- mode Supabase: les nouveaux fichiers vont dans un bucket Storage partage
- mode Firebase: backend alternatif deja prepare dans le code

Priorite actuelle:

1. Supabase si configure
2. sinon Firebase si configure
3. sinon local

Si aucun backend cloud n'est configure, l'app continue de fonctionner en local.

## Configuration Supabase

C'est le mode cloud le plus simple de cette app car il ne demande pas de table SQL.

1. Cree un projet Supabase.
2. Recupere `Project URL`.
3. Recupere la cle `service_role` dans `Settings > API`.
4. Copie `.env.example` vers `.env.local`.
5. Renseigne:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_STORAGE_BUCKET=media
```

Le bucket public sera prepare automatiquement au premier upload.

L'app y stocke:

- les MP3 dans `audio/`
- les covers dans `cover/`
- le catalogue partage dans `catalog/tracks.json`

Une fois ces variables presentes, les nouveaux uploads passent automatiquement sur Supabase.

## Migrer la bibliotheque locale vers Supabase

Si tu as deja des morceaux dans `public/audio` et `public/cover`, tu peux les envoyer vers Supabase:

```bash
npm run supabase:migrate
```

Pour re-uploader des fichiers deja presents:

```bash
npm run supabase:migrate -- --force
```

## Configuration Firebase

Le backend Firebase reste disponible dans le projet si tu veux l'utiliser plus tard.

Variables attendues:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
```

Migration locale vers Firebase:

```bash
npm run firebase:migrate
```

## Notes utiles

- Les uploads restent limites a `80 MB` par piste dans l'API actuelle.
- Les playlists et favoris restent locaux au navigateur pour l'instant.
- Les morceaux et covers deviennent partages entre utilisateurs des que l'app pointe vers le meme projet cloud.
