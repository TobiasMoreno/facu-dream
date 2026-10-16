# Ruta Óptima

Aplicación web local para distribuir vehículos entre flujos marítimos y transporte rodoviario con costo mínimo. El modelo usa programación lineal entera mixta mediante GLPK.js: todas las cantidades son enteras y no negativas, todo el volumen se transporta una sola vez y se respetan capacidades, mínimos, flujos habilitados y la regla rodoviaria independiente de cada planta.

## Requisitos

- Node.js 20.19 o superior (se recomienda Node.js 22.13+)
- npm 10 o superior

## Instalar y ejecutar

```bash
npm install
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

Para generar una versión de producción:

```bash
npm run build
npm run preview
```

## Pruebas

```bash
npm test
```

La suite confirma, entre otras cosas, que el caso inicial tiene un costo óptimo de **1.200.303,00**, que se conservan los volúmenes, que se cumplen capacidades y mínimos, y que una configuración contradictoria se informa como inviable sin relajar restricciones.

## Uso

1. En **Datos**, editá plantas, navieras, tarifas y la regla rodoviaria de cada planta. Cada origen puede exigir una cantidad exacta, mínima o máxima. Un campo de capacidad máxima de naviera vacío significa capacidad ilimitada.
2. Deshabilitá un flujo con su interruptor si no debe participar.
3. En **Resultado**, presioná **Optimizar**. Los errores de datos y las causas detectables de inviabilidad se presentan por separado.
4. Creá, duplicá, renombrá o eliminá escenarios desde la barra superior. Cada cambio se guarda automáticamente en `localStorage`.
5. Después de optimizar dos escenarios, abrí **Comparar** para contrastar costo y distribución.
6. Usá **Exportar** para descargar todos los escenarios en JSON e **Importar** para restaurarlos en otro navegador.

## Persistencia y privacidad

No hay backend ni base de datos. Los escenarios, datos y últimos resultados se conservan exclusivamente en el `localStorage` del navegador bajo la clave `ruta-optima-state-v1`. Exportar el JSON es la forma recomendada de generar una copia de seguridad.

## Estructura principal

- `src/lib/optimizer.ts`: formulación MILP, ejecución de GLPK y traducción del resultado.
- `src/lib/validation.ts`: validaciones de datos y diagnóstico de inviabilidad.
- `src/data/defaultScenario.ts`: caso inicial solicitado.
- `src/App.tsx`: interfaz, escenarios, importación/exportación, resultados y gráficos.
- `src/lib/optimizer.test.ts`: pruebas unitarias del motor.
