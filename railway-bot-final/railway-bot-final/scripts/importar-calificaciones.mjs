// scripts/importar-calificaciones.mjs
// Ejecutá este script UNA SOLA VEZ en la terminal de Railway
// para importar todas las calificaciones de Replit.
//
// Uso en terminal de Railway:
//   node scripts/importar-calificaciones.mjs

import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const calificaciones = [
  { id: 1,  staff_user_id: "1370583972643344520", calificador_user_id: "1358439055083311144", estrellas: 4, nota: "prueba",                                                                                                          created_at: "2026-02-15T17:14:24.195Z" },
  { id: 34, staff_user_id: "1370583972643344520", calificador_user_id: "1358439055083311144", estrellas: 4, nota: "prueba",                                                                                                          created_at: "2026-02-15T17:17:01.246Z" },
  { id: 35, staff_user_id: "1129528286691725416", calificador_user_id: "1129528286691725416", estrellas: 1, nota: "es el mejor staff test",                                                                                          created_at: "2026-02-15T20:03:58.523Z" },
  { id: 36, staff_user_id: "1129528286691725416", calificador_user_id: "1129528286691725416", estrellas: 5, nota: "test",                                                                                                            created_at: "2026-02-15T20:04:15.940Z" },
  { id: 37, staff_user_id: "1129528286691725416", calificador_user_id: "1129528286691725416", estrellas: 5, nota: "test",                                                                                                            created_at: "2026-02-15T20:04:25.448Z" },
  { id: 38, staff_user_id: "1129528286691725416", calificador_user_id: "1129528286691725416", estrellas: 5, nota: "test",                                                                                                            created_at: "2026-02-15T20:04:37.194Z" },
  { id: 39, staff_user_id: "1129528286691725416", calificador_user_id: "1129528286691725416", estrellas: 5, nota: "test",                                                                                                            created_at: "2026-02-15T20:04:49.011Z" },
  { id: 40, staff_user_id: "1463247277500928184", calificador_user_id: "1358439055083311144", estrellas: 5, nota: "Excelente atención mediante el ticket y me brindo información buena sobre mi caso.",                              created_at: "2026-02-15T20:28:54.858Z" },
  { id: 41, staff_user_id: "1129528286691725416", calificador_user_id: "1358439055083311144", estrellas: 5, nota: "prueba",                                                                                                          created_at: "2026-02-15T23:14:11.969Z" },
  { id: 42, staff_user_id: "1046958507280318474", calificador_user_id: "1244435069658206219", estrellas: 5, nota: "atiende rapido y no da vueltas",                                                                                  created_at: "2026-02-16T14:37:17.351Z" },
  { id: 43, staff_user_id: "1389732344977428673", calificador_user_id: "1311530158867484692", estrellas: 5, nota: "Es mi amigo y me atiendo después de unos segundos que abrí ticket",                                               created_at: "2026-02-16T18:14:49.181Z" },
  { id: 44, staff_user_id: "1183553385882976287", calificador_user_id: "1343322304754618439", estrellas: 5, nota: "me atendió rapidísimo y me lo solucionó al toque",                                                               created_at: "2026-02-16T19:51:49.798Z" },
  { id: 45, staff_user_id: "1129528286691725416", calificador_user_id: "1311530158867484692", estrellas: 5, nota: "Me resolvió mi duda",                                                                                             created_at: "2026-02-16T22:18:16.206Z" },
  { id: 46, staff_user_id: "1370583972643344520", calificador_user_id: "1222939276170231919", estrellas: 5, nota: "me antendio el ticket al toque y me hablo bien y sin errores",                                                    created_at: "2026-02-16T23:34:21.725Z" },
  { id: 47, staff_user_id: "770086705544822816",  calificador_user_id: "1311530158867484692", estrellas: 5, nota: "Me atendió rápido, aunque no me dijo ni hola pero me respondió mi duda",                                         created_at: "2026-02-17T03:21:54.725Z" },
  { id: 48, staff_user_id: "1355335749867929901", calificador_user_id: "1358439055083311144", estrellas: 5, nota: "Me respondió bastante rápido para ser el caso y me brindo información específica y siempre fue directo y respetuoso.", created_at: "2026-02-17T20:25:22.630Z" },
  { id: 49, staff_user_id: "1463247277500928184", calificador_user_id: "756278910588813385",  estrellas: 5, nota: "Un capo, atención rápida, respuesta a varias dudas y muy amable. Va a ser un muy buen mod",                      created_at: "2026-02-17T23:40:04.361Z" },
  { id: 50, staff_user_id: "1370583972643344520", calificador_user_id: "781134781983096842",  estrellas: 5, nota: "es re boludazo pero hace su trabajo",                                                                             created_at: "2026-02-18T00:44:05.752Z" },
  { id: 51, staff_user_id: "1355335749867929901", calificador_user_id: "999355145819267095",  estrellas: 5, nota: "Excelente como labura el pibe",                                                                                   created_at: "2026-02-18T17:59:54.226Z" },
  { id: 52, staff_user_id: "1046958507280318474", calificador_user_id: "999355145819267095",  estrellas: 2, nota: "Un poco mas de esmero",                                                                                           created_at: "2026-02-18T18:00:10.939Z" },
  { id: 53, staff_user_id: "1046958507280318474", calificador_user_id: "999355145819267095",  estrellas: 5, nota: "Almenos atiende bien y conoce los fundamentos uwu",                                                               created_at: "2026-02-18T19:13:34.944Z" },
  { id: 54, staff_user_id: "1358439055083311144", calificador_user_id: "1298407586940588054", estrellas: 5, nota: "Rapido, me arregla el problema en 2 segundos.",                                                                   created_at: "2026-02-18T19:18:16.971Z" },
  { id: 55, staff_user_id: "1389732344977428673", calificador_user_id: "1265159133531734076", estrellas: 5, nota: "uno de los q mas se destaca para abrir sv y de los mas activod 10/10",                                           created_at: "2026-02-18T20:18:57.290Z" },
  { id: 56, staff_user_id: "1358439055083311144", calificador_user_id: "1046958507280318474", estrellas: 5, nota: "Em, muy crack, responde rapido,",                                                                                 created_at: "2026-02-18T21:47:20.015Z" },
  { id: 57, staff_user_id: "1463247277500928184", calificador_user_id: "1339741535440338944", estrellas: 5, nota: "me ayudo en un monton de cosas,me atendio re rapido y fue buena onda,crack total.",                              created_at: "2026-02-19T03:17:58.453Z" },
  { id: 58, staff_user_id: "1129528286691725416", calificador_user_id: "1358439055083311144", estrellas: 1, nota: "prueba",                                                                                                          created_at: "2026-02-19T10:09:52.492Z" },
  { id: 59, staff_user_id: "1129528286691725416", calificador_user_id: "1358439055083311144", estrellas: 1, nota: "prueba",                                                                                                          created_at: "2026-02-19T10:10:42.646Z" },
  { id: 60, staff_user_id: "1004050528621318184", calificador_user_id: "1298407586940588054", estrellas: 2, nota: "No atiende el caso de buena manera, no revisa nisiquiera las pruebas, se basa en criterio propio.",              created_at: "2026-02-19T19:41:00.591Z" },
  { id: 61, staff_user_id: "1129528286691725416", calificador_user_id: "1147887910411059261", estrellas: 5, nota: "Atendio de buena y educada forma el ticket. Es amable y de verdad se merece las 5 estrellas.",                   created_at: "2026-02-19T19:58:27.331Z" },
  { id: 62, staff_user_id: "1129528286691725416", calificador_user_id: "1046958507280318474", estrellas: 5, nota: "Muy serio, Como debe ser, soluciono mi problema.",                                                                created_at: "2026-02-19T20:01:38.084Z" },
  { id: 63, staff_user_id: "1358439055083311144", calificador_user_id: "1298407586940588054", estrellas: 5, nota: "Atiende rapido y me deriva con su compañero.",                                                                    created_at: "2026-02-19T20:17:02.685Z" },
  { id: 64, staff_user_id: "1046958507280318474", calificador_user_id: "1298407586940588054", estrellas: 1, nota: "Intenta solucionar el problema (o eso aprece) de mala gana, no da soluciones concretas, desinteresado.",         created_at: "2026-02-19T20:17:37.880Z" },
  { id: 65, staff_user_id: "1129528286691725416", calificador_user_id: "890939655938244618",  estrellas: 5, nota: "Me contesto mi ticket rapido y resolvio lo que queria muy bien",                                                  created_at: "2026-02-19T21:24:38.569Z" },
  { id: 66, staff_user_id: "781134781983096842",  calificador_user_id: "1298407586940588054", estrellas: 5, nota: "El tipo atendio rapido, me soluciono todo un genio.",                                                             created_at: "2026-02-20T00:09:25.137Z" },
  { id: 67, staff_user_id: "781134781983096842",  calificador_user_id: "1298407586940588054", estrellas: 5, nota: "El sujeto me atiende de muy buena manera el ticket.",                                                             created_at: "2026-02-20T00:58:35.194Z" },
  { id: 68, staff_user_id: "1389732344977428673", calificador_user_id: "999355145819267095",  estrellas: 5, nota: "Ayuda emocional ademas sabe hacer bien las cosas este master of puppets espero que sea mod-j",                   created_at: "2026-02-20T14:35:45.908Z" },
  { id: 69, staff_user_id: "1183553385882976287", calificador_user_id: "1355335749867929901", estrellas: 5, nota: "Le dicen el mod precos, porque lo hace muy rápido",                                                               created_at: "2026-02-20T15:28:46.281Z" },
  { id: 70, staff_user_id: "1358439055083311144", calificador_user_id: "640933313439072282",  estrellas: 5, nota: "un capo me ayudo",                                                                                                created_at: "2026-02-20T21:13:01.782Z" },
  { id: 71, staff_user_id: "1046958507280318474", calificador_user_id: "781134781983096842",  estrellas: 5, nota: "me cae re mal y no sabe usar un comando pero el bb aprende rapido y hace su trabajo",                            created_at: "2026-02-20T21:30:18.539Z" },
  { id: 72, staff_user_id: "1004050528621318184", calificador_user_id: "781134781983096842",  estrellas: 5, nota: "igual que santi, es el coordinador y ni usar un comando sabe, se merce un ascenso a postulante",                 created_at: "2026-02-20T21:30:52.434Z" },
  { id: 73, staff_user_id: "1370583972643344520", calificador_user_id: "756278910588813385",  estrellas: 5, nota: "Me atendió rápido, y al minuto ya solucionó mi problema, así da gusto",                                          created_at: "2026-02-20T22:57:39.655Z" },
  { id: 74, staff_user_id: "1370583972643344520", calificador_user_id: "754899049785852026",  estrellas: 5, nota: "Buena atención, rápidez y amabilidad.",                                                                           created_at: "2026-02-20T23:22:29.637Z" },
  { id: 75, staff_user_id: "1389732344977428673", calificador_user_id: "754899049785852026",  estrellas: 4, nota: "Buena atención, concreto y amable.",                                                                              created_at: "2026-02-20T23:22:46.826Z" },
  { id: 76, staff_user_id: "1004050528621318184", calificador_user_id: "1298407586940588054", estrellas: 5, nota: "Las veces que llame mod, el tipo vino al toke y me atendio bien, un pelotudo el tipo igual.",                    created_at: "2026-02-21T00:35:49.331Z" },
  { id: 77, staff_user_id: "1129528286691725416", calificador_user_id: "1358439055083311144", estrellas: 1, nota: "Visualización de actualización.",                                                                                 created_at: "2026-02-21T13:11:25.530Z" },
  { id: 78, staff_user_id: "1129528286691725416", calificador_user_id: "1358439055083311144", estrellas: 1, nota: "Visualización de actualización.",                                                                                 created_at: "2026-02-21T13:12:13.333Z" },
  { id: 79, staff_user_id: "770086705544822816",  calificador_user_id: "640933313439072282",  estrellas: 5, nota: "corto y bien explicado",                                                                                          created_at: "2026-02-21T21:39:23.619Z" },
  { id: 80, staff_user_id: "1046958507280318474", calificador_user_id: "1129528286691725416", estrellas: 3, nota: "Baja seriedad, Rapida atención.",                                                                                 created_at: "2026-02-21T22:26:53.502Z" },
];

async function importar() {
  const client = await pool.connect();
  try {
    console.log("🔄 Creando tabla si no existe...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS calificaciones (
        id                  SERIAL PRIMARY KEY,
        staff_user_id       TEXT NOT NULL,
        calificador_user_id TEXT NOT NULL,
        estrellas           INTEGER NOT NULL,
        nota                TEXT NOT NULL,
        created_at          TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("🔄 Importando calificaciones...");
    let importadas = 0;
    let omitidas   = 0;

    for (const c of calificaciones) {
      const existe = await client.query(
        "SELECT id FROM calificaciones WHERE staff_user_id = $1 AND calificador_user_id = $2 AND nota = $3 AND estrellas = $4",
        [c.staff_user_id, c.calificador_user_id, c.nota, c.estrellas]
      );
      if (existe.rows.length > 0) {
        omitidas++;
        continue;
      }
      await client.query(
        "INSERT INTO calificaciones (staff_user_id, calificador_user_id, estrellas, nota, created_at) VALUES ($1, $2, $3, $4, $5)",
        [c.staff_user_id, c.calificador_user_id, c.estrellas, c.nota, c.created_at]
      );
      importadas++;
    }

    // Ajustar el auto-increment para que arranque desde después del último ID
    await client.query(`SELECT setval('calificaciones_id_seq', (SELECT MAX(id) FROM calificaciones))`);

    console.log(`✅ Importación completada.`);
    console.log(`   → ${importadas} calificaciones importadas`);
    console.log(`   → ${omitidas} omitidas (ya existían)`);
    console.log(`   → El contador de IDs fue ajustado correctamente.`);
  } catch (error) {
    console.error("❌ Error durante la importación:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importar();
