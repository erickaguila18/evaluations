# Plataforma EEMS - Evaluaciones y Cursos

Plataforma web modular para la creación, aplicación y gestión de evaluaciones, cursos interactivos y encuestas. Desarrollada con HTML, CSS y Vanilla JavaScript en archivos estructurados, y respaldada por Firebase.

## Características Principales

* **Sistema de Roles:** Acceso por credenciales para Instructores y acceso por "Código de Clase" para Alumnos.
* **Módulos de Actividad:**
  * **Exámenes:** Temporizador, calificación automática y retroalimentación de áreas de oportunidad.
  * **Cursos:** Módulos en video, material descargable y progreso guardado.
  * **Encuestas:** Reactivos abiertos, de opción múltiple y escalas con cálculo de promedios.
* **Entorno Seguro:** Detección de pérdida de foco, control de inactividad (15s), bloqueo de atajos de teclado y sistema de anulación por infracciones.
* **Marca Blanca (White-label):** Personalización dinámica de colores, logotipo, favicon, textos del pie de página y enlaces a redes sociales, con función de restauración de fábrica.
* **Certificados Nativos:** Renderizado de diplomas en HTML5 Canvas (1600x1200px) para descarga directa (PNG/JPG).
* **Analíticas:** Calificaciones en tiempo real, tabulación de encuestas y exportación global de métricas a CSV.

## Estructura y Tecnologías

* **Arquitectura:** Frontend modular (HTML, CSS y JS separados).
* **Backend:** Firebase (Firestore Database y Authentication).
* **Gráficos:** HTML5 Canvas API.
* **UI:** Flaticon (Solid Straight y Brands).

## Formatos de Carga (JSON)

Para crear actividades, la plataforma requiere subir un archivo `.json` con la estructura correspondiente al tipo de actividad seleccionado.

### 1. Evaluaciones (Exámenes)
Requiere la pregunta, un arreglo de 4 opciones, el índice de la respuesta correcta (iniciando en 0) y el tema a evaluar.
```
[
  {
    "q": "¿Cuál es la capital de Francia?",
    "opts": ["Madrid", "París", "Berlín", "Roma"],
    "ans": 1,
    "topic": "Geografía Europea"
  },
  {
    "q": "¿En qué año llegó el hombre a la luna?",
    "opts": ["1965", "1969", "1972", "1980"],
    "ans": 1,
    "topic": "Historia Universal"
  }
]
```
### 2. Encuestas
Soporta tres tipos de reactivos: scale (escala 1-10), open (texto libre) y multiple (opción múltiple).

```
[
  {
    "q": "Del 1 al 10, ¿qué tan útil te pareció la sesión de hoy?",
    "type": "scale"
  },
  {
    "q": "¿Qué temas te gustaría que abordáramos en el futuro?",
    "type": "open"
  },
  {
    "q": "¿Cómo calificarías el desempeño del instructor?",
    "type": "multiple",
    "opts": ["Excelente", "Bueno", "Regular", "Necesita mejorar"]
  }
]
```
### 3. Cursos
Cada bloque representa un módulo secuencial. Incluye el título, el enlace de YouTube y un arreglo opcional de archivos adjuntos.
```
[
  {
    "title": "Introducción al Soporte Vital",
    "video": "[https://www.youtube.com/watch?v=EjemploID](https://www.youtube.com/watch?v=EjemploID)",
    "attachments": [
      {
        "name": "Guía de Estudio PDF",
        "url": "[https://enlace-a-tu-archivo.com/guia.pdf](https://enlace-a-tu-archivo.com/guia.pdf)"
      }
    ]
  },
  {
    "title": "Uso del Desfibrilador (DEA)",
    "video": "[https://www.youtube.com/watch?v=EjemploID2](https://www.youtube.com/watch?v=EjemploID2)",
    "attachments": []
  }
]

```
