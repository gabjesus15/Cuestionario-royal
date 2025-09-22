// logic/questions.js
// Banco por defecto + normalizador a "preguntas selladas" del lobby.

export const DEFAULT_QUESTIONS = [
  { questionIndex: 0, category: "Geografía",  text: "¿Cuál es la capital de Francia?", options: ["Londres","París","Madrid","Roma"], correctIndex: 1 },
  { questionIndex: 1, category: "Historia",   text: "¿En qué año llegó el hombre a la Luna?", options: ["1967","1969","1971","1973"], correctIndex: 1 },
  { questionIndex: 2, category: "Ciencia",    text: "¿Cuál es el planeta más grande del sistema solar?", options: ["Saturno","Neptuno","Júpiter","Urano"], correctIndex: 2 },
  { questionIndex: 3, category: "Literatura", text: "¿Quién escribió 'Don Quijote de la Mancha'?", options: ["Lope de Vega","Miguel de Cervantes","Federico García Lorca","Calderón de la Barca"], correctIndex: 1 },
  { questionIndex: 4, category: "Geografía",  text: "¿Cuál es el océano más grande del mundo?", options: ["Atlántico","Índico","Ártico","Pacífico"], correctIndex: 3 },
];

/** Convierte tu banco local (compat) al formato sellado usado por startMatch. */
export function toSealedQuestions(questionsLike) {
  return (questionsLike || []).map((q, i) => ({
    questionIndex: Number.isInteger(q.questionIndex) ? q.questionIndex : i,
    category: q.category,
    text: q.text ?? q.question,
    options: q.options,
    correctIndex: q.correctIndex ?? q.correct,
  }));
}
