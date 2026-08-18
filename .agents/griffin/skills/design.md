# Skill: Diseño de interfaz (UI/UX y sistema de diseño)

Buenas prácticas genéricas de diseño de interfaz, independientes de cualquier proyecto, framework o sistema de diseño concreto. Se combinan con las convenciones propias del repo/design system (que siempre tienen prioridad si entran en conflicto).

- **Un solo sistema de tokens.** Color, espaciado, tipografía y radios/sombras deben salir de variables/tokens centralizados, nunca de valores sueltos repetidos en cada componente — si un valor se usa más de una vez, probablemente debería ser un token.
- **Reutiliza antes de crear.** Si ya existe un componente para un patrón (botón, input, modal, tarjeta, tabla...), extiéndelo o parametrízalo en vez de crear una variante paralela que diverja con el tiempo.
- **Contraste y legibilidad**: cumple como mínimo WCAG AA (contraste 4.5:1 para texto normal, 3:1 para texto grande/elementos de UI) salvo que el proyecto declare otro estándar.
- **Estados de foco siempre visibles** para navegación por teclado — nunca `outline: none` (o equivalente) sin un reemplazo visible equivalente.
- **Semántica antes que ARIA**: usa el elemento HTML nativo correcto (`button`, `nav`, `label`...) antes de añadir roles ARIA; ARIA es para lo que el HTML nativo no puede expresar, no un sustituto por defecto.
- **Objetivo táctil mínimo** (~44x44px) en elementos interactivos pensados para touch.
- **Todo estado de una vista es parte del diseño**: vacío, carga, error y éxito deben diseñarse con la misma atención que el camino feliz con datos — no un "ya se verá" implícito.
- **La interactividad no depende solo del color** para comunicarse (por ejemplo, un enlace distinguible sin depender únicamente de su color; un error señalado con algo más que el color rojo).
- **Jerarquía tipográfica consistente**: la importancia visual del texto (tamaño, peso, color) debe corresponder a su importancia real en el contenido, con una escala limitada de tamaños, no valores arbitrarios.
- **Copy claro y sin jerga técnica** de cara al usuario final — un mensaje de error debe decir qué pasó y qué puede hacer el usuario, no exponer un código o una excepción interna.
- **Animación con propósito**, nunca decorativa por defecto — y respeta `prefers-reduced-motion` si el proyecto ya gestiona preferencias de accesibilidad de movimiento.
- **Diseño responsive por defecto** si el proyecto lo es: comprueba contenido muy corto/muy largo, pantallas estrechas y truncamiento de texto antes de dar un layout por terminado.
- **Una sola fuente de tokens por tema**: en proyectos con temas (claro/oscuro), los estilos nuevos usan los tokens de tema, nunca colores fijos que solo funcionen bien en uno de los modos.
