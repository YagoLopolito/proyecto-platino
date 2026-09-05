This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Instalar la app en el celular

Platinoob es una PWA: se instala desde el navegador, sin App Store ni Play Store.

- **Android / Chrome**: entrar a Configuración › Conexiones y tocar **Instalar app**, o usar
  "Instalar aplicación" del menú del navegador.
- **iPhone / Safari**: botón **Compartir** › **Añadir a pantalla de inicio**. (Tiene que ser
  Safari: Chrome en iOS no puede instalar apps web.)

Se actualiza sola: cuando se mergea un PR y Vercel deploya, la app instalada detecta el build
nuevo y ofrece "Actualizar". No hay nada que publicar aparte. El detalle del mecanismo está en
`CLAUDE.md`, sección "App instalable en el celular (PWA)".

## Tests end-to-end (Playwright)

La estrategia completa, la matriz de casos y las convenciones están en
[`TESTING_PRD.md`](TESTING_PRD.md). Resumen operativo:

```bash
cp .env.example .env.test.local   # completar las claves de Supabase
npm run e2e                       # suite determinista, con mocks
```

| Comando | Qué hace |
| --- | --- |
| `npm run e2e` | Suite completa headless, con `E2E_MOCKS=1` |
| `npm run e2e:ui` | Modo UI de Playwright, para desarrollar tests |
| `npm run e2e:headed` | Con browser visible |
| `npm run e2e:live` | Solo los `@live`, contra PSN/Groq/RAWG reales |
| `npm run e2e:smoke` | Smoke contra `PLAYWRIGHT_BASE_URL` |
| `npm run e2e:report` | Abre el último reporte HTML |

Los tests corren contra el proyecto Supabase real con usuarios descartables
(`e2e+...@proyecto-platino.test`) y filas de catálogo prefijadas `[E2E]`, que el
teardown borra siempre. Para dejar los datos y poder inspeccionarlos,
`E2E_KEEP_DATA=1`.
