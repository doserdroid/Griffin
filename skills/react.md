# Skill: React

Buenas prácticas técnicas genéricas para escribir componentes React, independientes de cualquier proyecto concreto. Se combinan con las convenciones propias del repo (que siempre tienen prioridad si entran en conflicto).

- **Componentes funcionales + hooks**, salvo que el repo ya use clases de forma consistente (en cuyo caso, sigue lo existente).
- **Respeta las reglas de los hooks**: nunca condicionales, nunca fuera de un componente o de un hook propio, siempre en el mismo orden.
- **Los componentes son de presentación.** Si el proyecto separa lógica de negocio de la UI (casos de uso, servicios, hooks propios...), la lógica no trivial va ahí, no inline en el componente — comprueba primero cómo está organizado el resto del proyecto.
- **Tipa las props explícitamente**, incluyendo cuáles son opcionales.
- **Composición sobre prop-drilling profundo.** Si estás pasando una prop a través de 3+ niveles solo para que llegue abajo, considera composición, contexto (con moderación) o extraer el subárbol.
- **Claves estables en listas** (`key`): nunca el índice del array si la lista puede reordenarse, filtrarse o editarse.
- **Inputs controlados por defecto**, salvo razón concreta para lo contrario.
- **Accesibilidad básica**: elementos semánticos (`button`, `label`, `nav`...) en vez de `div`/`span` con handlers, `alt` en imágenes, asociar labels con inputs.
- **No optimices prematuramente.** `useMemo`/`useCallback`/`React.memo` solo cuando haya una razón concreta (medida o evidente) para evitar un re-render costoso, no por defecto en todo.
