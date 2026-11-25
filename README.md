# Casa Canela · Planificador de obrador

Prototipo para la clase de Gestión de Restaurantes con IA (Keila Jimenez – Finanzas y Sistemas).
Empresa y datos ficticios.

- Archivos de la raíz — app web estática (Render). `engine.js` es el motor de proyección, producción, compras y food cost.
- La API vive en Supabase (Edge Function `casa-canela`) y usa el mismo `engine.js`; Make la llama para cargar ventas y enviar correos.

Flujo: ventas → proyección (promedio ponderado 40/30/20/10 de los últimos 4 días iguales, sin días atípicos) → orden de producción por receta base → compras por proveedor.
