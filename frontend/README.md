# AkoeNet — frontend

Cliente web de AkoeNet. Documentación general: **[`../docs/README.md`](../docs/README.md)**.

## Uso básico

```bash
cd frontend
npm install
npm run dev
```

## App de escritorio

Compilar cliente de escritorio:

```bash
cd frontend
npm run tauri:build
```

## App Android

Sincronizar cambios nativos:

```bash
cd frontend
npm run mobile:sync:android
```

Generar build de publicación para actualizaciones en Play:

```bash
cd frontend
npm run mobile:bundle:release
```

Archivo generado:
`frontend/android/app/build/outputs/bundle/release/app-release.aab`
