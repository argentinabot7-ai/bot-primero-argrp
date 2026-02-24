import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextChannel,
  DMChannel,
  NewsChannel,
  ThreadChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";

// ── Base de datos SQLite ──────────────────────────────────────────────────────
import {
  insertArresto,
  getArrestosByUser,
  deleteArrestosByUser,
  insertMulta,
  getMultasByUser,
  deleteMultasByUser,
  insertLog,
} from "./database";

const SCRIPT_DIR = path.join(process.cwd(), "server");
const LOGO_PATH  = path.join(SCRIPT_DIR, "logo_argrp.png");

// ── Constantes de canales ─────────────────────────────────────────────────────
const CANAL_CALIFICAR_STAFF        = "1349870171564539968";
const CANAL_DESTINO_CALIFICACIONES = "1406301292967628943";
const CANAL_VERIFICAR              = "1458212074453864601";
const CANAL_BIENVENIDA             = "1349870171296108573";
const CANAL_ENTORNO                = "1451324760423268403";
const CANAL_ARRESTOS               = "1349870173703901241";
const CANAL_MULTAS                 = "1349870173703901239";
const CANAL_SOLICITAR_ROL          = "1349870172663582753";
const CANAL_LOG_REGISTROS          = "1475710164337168437";
const GUILD_ID                     = "1349870169056350270";

// ── Constantes de roles ───────────────────────────────────────────────────────
const ROL_MODERADOR        = "1349870169756930109";
const ROL_POSTULANTE_STAFF = "1349870169756930110";
const ROL_MODERADOR_MUTE   = "1349870169756930113";
const ROL_CIUDADANO        = "1349870169232511064";
const ROL_NO_VERIFICADO    = "1349870169232511063";

const ROLES_POLICIA = [
  "1353392018201509960",
  "1349870169362661440",
  "1387584047685046312",
  "1349870169362661439",
];

const ROL_STAFF_SOLICITUDES = "1465134485048922382";

// Tecnicaturas
const ROL_ENCARGADO_DNI     = "1350155232822165626";
const ROL_ASISTENTE_VERIF   = "1350137848010899548";
const ROL_ENCARGADO_EVENTOS = "1469722340131733625";
const ROL_ENCARGADO_LIC     = "1414260583288799354";
const ROL_PERMISO_ROLES     = "1350203343003455539";
const ROL_PERMISO_DINERO    = "1357158037176979566";
const ROL_PERMISO_ROBLOX    = "1350203382199095399";

const TECNICATURA_MAP: Record<string, { roleId: string; label: string }> = {
  enc_dni:     { roleId: ROL_ENCARGADO_DNI,     label: "Encargado DNI"            },
  asist_verif: { roleId: ROL_ASISTENTE_VERIF,   label: "Asistente Verificaciones" },
  enc_eventos: { roleId: ROL_ENCARGADO_EVENTOS, label: "Encargado Eventos"         },
  enc_lic:     { roleId: ROL_ENCARGADO_LIC,     label: "Encargado Lic. Conducir"  },
  perm_roles:  { roleId: ROL_PERMISO_ROLES,     label: "Permiso Roles"             },
  perm_dinero: { roleId: ROL_PERMISO_DINERO,    label: "Permiso Dinero"            },
  perm_roblox: { roleId: ROL_PERMISO_ROBLOX,    label: "Permiso Roblox"            },
};

const DISABLED_VALUES = ["disabled_cf", "disabled_cks"];

// ── Maps de estado temporal (sesiones, no requieren persistencia) ─────────────
const pendingVerifications = new Map<string, {
  targetUserId:  string;
  usuarioRoblox: string;
  avatarUrl:     string;
  fullBodyUrl:   string;
  moderatorId:   string;
}>();

const saludosDados = new Map<string, Set<string>>();

const pendingSolicitudes = new Map<string, {
  requesterId: string;
  rolId:       string;
  rolName:     string;
  motivo:      string;
  pruebasUrl:  string;
}>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasPoliceRole(member: any): boolean {
  if (!member || !("roles" in member)) return false;
  return ROLES_POLICIA.some((r) => (member.roles as any).cache.has(r));
}

function hasStaffSolicitudesRole(member: any): boolean {
  if (!member || !("roles" in member)) return false;
  return (member.roles as any).cache.has(ROL_STAFF_SOLICITUDES);
}

function fechaHoy(): string {
  return new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fechaHoraAhora(): string {
  return new Date().toLocaleString("es-AR");
}

// ── Helpers Roblox ────────────────────────────────────────────────────────────

async function getRobloxData(
  username: string,
): Promise<{ id: number; name: string; avatarUrl: string; fullBodyUrl: string } | null> {
  try {
    const userRes  = await fetch("https://users.roblox.com/v1/usernames/users", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    const userData = await userRes.json();
    if (!userData.data || userData.data.length === 0) return null;
    const userId = userData.data[0].id;
    const name   = userData.data[0].name;
    const [bustRes, bodyRes] = await Promise.all([
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${userId}&size=420x420&format=Png&isCircular=false`),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`),
    ]);
    const bustData    = await bustRes.json();
    const bodyData    = await bodyRes.json();
    const avatarUrl   = bustData.data?.[0]?.imageUrl ?? "";
    const fullBodyUrl = bodyData.data?.[0]?.imageUrl ?? avatarUrl;
    return { id: userId, name, avatarUrl, fullBodyUrl };
  } catch { return null; }
}

async function searchRobloxUsers(query: string): Promise<{ id: number; name: string }[]> {
  try {
    const [searchRes, exactRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=10`),
      fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [query], excludeBannedUsers: false }),
      }),
    ]);
    const searchData = await searchRes.json();
    const exactData  = await exactRes.json();
    const searchResults: { id: number; name: string }[] = searchData.data ? (searchData.data as any[]).map((u) => ({ id: u.id as number, name: u.name as string })) : [];
    const exactResults:  { id: number; name: string }[] = exactData.data  ? (exactData.data  as any[]).map((u) => ({ id: u.id as number, name: u.name as string })) : [];
    const seen = new Set<number>();
    const combined: { id: number; name: string }[] = [];
    for (const u of [...exactResults, ...searchResults]) {
      if (!seen.has(u.id)) { seen.add(u.id); combined.push(u); }
    }
    return combined.slice(0, 10);
  } catch { return []; }
}

async function getRobloxUserInfo(userId: number): Promise<{
  id: number; name: string; displayName: string; description: string;
  created: string; isBanned: boolean; fullBodyUrl: string; profileUrl: string;
  friendCount: number; followerCount: number; followingCount: number;
} | null> {
  try {
    const [userRes, bodyRes, friendsRes, followersRes, followingRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${userId}`),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`),
      fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
      fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
      fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`),
    ]);
    const [user, bodyData, friends, followers, following] = await Promise.all([
      userRes.json(), bodyRes.json(), friendsRes.json(), followersRes.json(), followingRes.json(),
    ]);
    if (!user || user.errors) return null;
    const created = new Date(user.created).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
    return {
      id: user.id, name: user.name, displayName: user.displayName ?? user.name,
      description: user.description?.trim() || "Sin descripción.", created,
      isBanned: user.isBanned ?? false, fullBodyUrl: bodyData.data?.[0]?.imageUrl ?? "",
      profileUrl: `https://www.roblox.com/users/${userId}/profile`,
      friendCount: friends.count ?? 0, followerCount: followers.count ?? 0, followingCount: following.count ?? 0,
    };
  } catch { return null; }
}

async function getRobloxFromNickname(nickname: string | null): Promise<{ id: number; name: string; avatarUrl: string; fullBodyUrl: string } | null> {
  if (!nickname) return null;
  return getRobloxData(nickname.trim().split(" ")[0]);
}

function isTextChannel(ch: any): ch is TextChannel | DMChannel | NewsChannel | ThreadChannel {
  return ch instanceof TextChannel || ch instanceof DMChannel || ch instanceof NewsChannel || ch instanceof ThreadChannel;
}

// ── Roles disponibles para /solicitar-rol ─────────────────────────────────────
const ROLES_DISPONIBLES = [
  { name: "Gendarmería Nacional",      value: "role_gendarmeria"    },
  { name: "Policía Federal Argentina", value: "role_pfa"            },
  { name: "Policía de la Ciudad",      value: "role_policia_ciudad" },
  { name: "Brigada Especial Halcón",   value: "role_halcon"         },
  { name: "SAME",                      value: "role_same"           },
  { name: "Bomberos de la Ciudad",     value: "role_bomberos"       },
  { name: "Automóvil Club Argentino",  value: "role_aca"            },
  { name: "Corte Suprema de Justicia", value: "role_corte"          },
  { name: "Seguridad Privada",         value: "role_seg_privada"    },
  { name: "Empresa de Eventos",        value: "role_eventos"        },
  { name: "Noticiero",                 value: "role_noticiero"      },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_MENUS = [
  {
    label: "✅ | ¿Cómo me verifico?", value: "faq_verificacion", description: "Métodos de verificación en la comunidad.",
    response: ["**¿CÓMO ME VERIFICO?**","Esta pregunta es bastante común cuando recién ingresas a nuestra comunidad. Acá te dejamos la respuesta de forma clara y directa (visita <#1466630354012999794>).","","**MELONLY**","Visitá el canal <#1457899075427893564>. Encontrarás un embed con dos botones: **Verify with Melonly** y **¿How do I verify?**. Presioná **Verify with Melonly**; si ya tenés tu cuenta de Discord vinculada con Roblox, se te verificará automáticamente. De lo contrario, aparecerá un botón **Verify** que te llevará a la web de Melonly para vincular ambas cuentas.","","**VERIFICACIÓN MANUAL**","Visitá <#1466630354012999794> para obtener información completa. En resumen: dirigite al canal <#1458212074453864601> y enviá la plantilla disponible en **Info-Verificación** completando todos los campos correctamente. Es **obligatorio** adjuntar una foto de tu perfil de Roblox para que los encargados puedan verificarte."].join("\n"),
  },
  {
    label: "📄 | ¿Cómo crear mi DNI y/o licencia?", value: "faq_dni_licencia", description: "Información sobre DNI y Licencia de Conducir.",
    response: ["**¿CÓMO CREAR MI DNI Y/O LICENCIA?**","","**DOCUMENTO NACIONAL DE IDENTIDAD**","Dirigite al canal <#1472380283348062341> y ejecutá el comando `/crear-dni`. Completá los campos correctamente; el mínimo error puede invalidar tu DNI. Luego se te pedirá información **IC** de tu personaje.","Para visualizar tu DNI usá `/ver-dni` en <#1349870171564539968>. El DNI es **privado**, no lo compartas.","Antes de crearlo, leé atentamente <#1350123157771653191>. Es obligatorio tener el outfit deseado puesto al ejecutar el comando y que la cara no esté cubierta.","","**LICENCIA DE CONDUCIR**","Primero necesitás tener tu DNI creado correctamente. Luego dirigite a <#1352695371121430548> y completá el formulario; te pedirá una imagen de tu DNI. Si es aceptado, recibirás el rol <@&1352694610509693031> automáticamente."].join("\n"),
  },
  {
    label: "💼 | ¿Cómo consigo un trabajo?", value: "faq_trabajo", description: "Trabajos primarios y secundarios disponibles.",
    response: ["**¿CÓMO CONSIGO UN TRABAJO?**","Si no entendés algo podés consultarlo en <#1350160761653170246>.","","En nuestra comunidad existen dos tipos de trabajos:","","**TRABAJOS PRIMARIOS**","Incluyen: Gendarmería, Policía Federal, Policía de la Ciudad, Brigada Especial Halcón, SAME, Bomberos de la Ciudad, Automóvil Club Argentino y Corte Suprema de Justicia de la Nación. Cuentan con oposiciones, formulario de acceso y sueldos mínimos de hasta **$4.000 pesos** directos a tu economía.","Accesos: <#1465841180049936498> <#1465841380793516255> <#1465842091568660500> <#1465842374096846852> <#1465842838460825760> <#1465867906746286192>","","**TRABAJOS SECUNDARIOS**","Incluyen empresas públicas y privadas: seguridad privada, servicios de atención, empresas de eventos, noticieros y más. También podés trabajar como <@&1349870169337368660> o <@&1350128958477172796> con un sueldo de **$1.500 pesos** por actividad. Las empresas pagan un mínimo de **$5.000 pesos**.","Empresas disponibles: <#1352692574401331230>. Para dudas internas, contactá a soporte mediante Ticket."].join("\n"),
  },
  {
    label: "🎮 | ¿Cómo me uno a ER:LC?", value: "faq_erlc", description: "Requisitos y pasos para unirte al servidor privado.",
    response: ["**¿CÓMO ME UNO A ER:LC?**","Tenés 3 opciones disponibles directamente en <#1459632267461656910>: acceso directo, servidor listado o código directo.","","Para unirte necesitás ser **Tier 1** en ER:LC, lo que requiere un mínimo de **1 hora** jugada en servidores públicos y **500 XP**. Recomendamos ponerte de Bombero para acumular XP más rápido.","","Si al intentar unirte aparece el error **\"Bloqueado\"**, es probable que tu cuenta de Roblox tenga menos de 1 mes de antigüedad. También te recomendamos unirte a nuestro servidor <#1459294451083251783>."].join("\n"),
  },
  {
    label: "💎 | ¿Cómo compro membresía y boost?", value: "faq_membresia", description: "Información sobre membresías y boosters.",
    response: ["**¿CÓMO COMPRO MEMBRESÍA Y BOOST?**","Si tenés más dudas, consultá en <#1350160761653170246>.","","**MEMBRESÍAS**","Visitá <#1349870171044708432> para ver los tipos de membresías y sus beneficios. Los beneficios nunca disminuyen, siempre aumentan con el tiempo. Incluyen acceso a sorteos VIP y canales exclusivos.","","**BOOSTERS**","Para realizar un boost, accedé al menú del servidor (barra superior de la lista de canales) y presioná el botón **rosado** que aparece. Los beneficios superan a los de las membresías; podés verlos en <#1349870171044708433>.","Si realizás más de **4 boosts**, la Administración te crea un rol totalmente personalizado. También obtenés roles automáticos y aparecés en la parte superior de la lista de jugadores.","-# El beneficio del ,collect puede aumentar próximamente (boosters)."].join("\n"),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/stats", async (_req, res) => { res.json({ status: "active" }); });

  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  if (!DISCORD_TOKEN) { console.warn("DISCORD_TOKEN is not set. Bot will not start."); return httpServer; }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    ],
  });

  // ── Slash commands ────────────────────────────────────────────────────────
  const commands = [
    new SlashCommandBuilder().setName("calificar-staff").setDescription("Califica el desempeño de un miembro del staff.")
      .addUserOption((o) => o.setName("staff").setDescription("Miembro del staff a calificar.").setRequired(true))
      .addIntegerOption((o) => o.setName("estrellas").setDescription("Calificación de 1 a 5 estrellas.").setRequired(true).addChoices({ name: "⭐", value: 1 }, { name: "⭐⭐", value: 2 }, { name: "⭐⭐⭐", value: 3 }, { name: "⭐⭐⭐⭐", value: 4 }, { name: "⭐⭐⭐⭐⭐", value: 5 }))
      .addStringOption((o) => o.setName("opinion_personal").setDescription("Explica por qué das esta calificación.").setRequired(true).setMaxLength(500)),

    new SlashCommandBuilder().setName("añadir-rol").setDescription("Añade un rol a un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le añadirá el rol.").setRequired(true))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que se añadirá al usuario.").setRequired(true)),

    new SlashCommandBuilder().setName("eliminar-rol").setDescription("Elimina un rol de un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminará el rol.").setRequired(true))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que se eliminará del usuario.").setRequired(true)),

    new SlashCommandBuilder().setName("lista-staff").setDescription("Muestra la lista de moderadores y postulantes del staff."),

    new SlashCommandBuilder().setName("muted").setDescription("Silencia a un usuario por un tiempo determinado.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a silenciar.").setRequired(true))
      .addStringOption((o) => o.setName("tiempo").setDescription("Tiempo de silencio (ej: 1 hora, 30 minutos, 2 días).").setRequired(true))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo del silencio.").setRequired(true).setMaxLength(500)),

    new SlashCommandBuilder().setName("verificar").setDescription("Verifica a un usuario de la comunidad.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a verificar.").setRequired(true))
      .addStringOption((o) => o.setName("usuario_roblox").setDescription("Nombre de usuario de Roblox.").setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder().setName("entorno").setDescription("Registra el entorno actual de tu personaje en el roleplay.")
      .addStringOption((o) => o.setName("lugar").setDescription("Lugar donde se encuentra tu personaje.").setRequired(true))
      .addStringOption((o) => o.setName("entorno").setDescription("Descripción del entorno o situación actual.").setRequired(true).setMaxLength(500))
      .addStringOption((o) => o.setName("usuario_roblox").setDescription("Tu nombre de usuario de Roblox.").setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder().setName("roblox-info").setDescription("Muestra información detallada de una cuenta de Roblox.")
      .addStringOption((o) => o.setName("usuario_roblox").setDescription("Nombre de usuario de Roblox. Si no ponés nada, se usa tu apodo.").setRequired(false).setAutocomplete(true)),

    new SlashCommandBuilder().setName("arrestar").setDescription("Registra el arresto de un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario arrestado.").setRequired(true))
      .addStringOption((o) => o.setName("cargos").setDescription("Cargos del arresto.").setRequired(true).setMaxLength(500))
      .addAttachmentOption((o) => o.setName("foto-arresto").setDescription("Foto del arresto como prueba.").setRequired(true)),

    new SlashCommandBuilder().setName("registros-arrestos").setDescription("Muestra los registros de arrestos de un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a consultar (opcional).").setRequired(false)),

    new SlashCommandBuilder().setName("eliminar-arrestos").setDescription("Elimina los arrestos de un usuario de la base de datos.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminarán los arrestos.").setRequired(true))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la eliminación.").setRequired(true).setMaxLength(500)),

    new SlashCommandBuilder().setName("multar").setDescription("Registra una multa a un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario multado.").setRequired(true))
      .addStringOption((o) => o.setName("cargos").setDescription("Cargos de la multa.").setRequired(true).setMaxLength(500))
      .addAttachmentOption((o) => o.setName("foto-multa").setDescription("Foto de la multa como prueba.").setRequired(true)),

    new SlashCommandBuilder().setName("eliminar-multa").setDescription("Elimina las multas de un usuario de la base de datos.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminarán las multas.").setRequired(true))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la eliminación.").setRequired(true).setMaxLength(500)),

    new SlashCommandBuilder().setName("solicitar-rol").setDescription("Solicita un rol al staff.")
      .addStringOption((o) => o.setName("nombre-rol").setDescription("Rol que deseas solicitar.").setRequired(true).addChoices(...ROLES_DISPONIBLES.map((r) => ({ name: r.name, value: r.value }))))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo de tu solicitud.").setRequired(true).setMaxLength(500))
      .addAttachmentOption((o) => o.setName("pruebas").setDescription("Foto con las pruebas de tu solicitud.").setRequired(true)),
  ];

  // ── Ready ─────────────────────────────────────────────────────────────────
  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    console.log("Base de datos SQLite iniciada correctamente.");
    const statuses = [
      { name: "Developer: @vladimirfernan.", type: ActivityType.Watching },
      { name: "TikTok: Argentina_rperlc",    type: ActivityType.Watching },
    ];
    let si = 0;
    const tick = () => { const s = statuses[si++ % statuses.length]; client.user?.setPresence({ activities: [{ name: s.name, type: s.type }], status: "online" }); };
    tick(); setInterval(tick, 15_000);
    try {
      const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
      if (client.user?.id) { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); console.log("Slash commands registrados."); }
    } catch (e) { console.error(e); }
  });

  // ── Prefix commands ───────────────────────────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const PREFIX = "c?";
    if (!message.content.startsWith(PREFIX)) return;
    const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (!isTextChannel(message.channel)) return;

    if (command === "info") {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Información General — Bot Argentina RP")
        .setDescription("**Comandos disponibles:**\n`/calificar-staff` — Califica al staff\n`/verificar` — Verifica a un usuario\n`/entorno` — Registra el entorno de tu personaje\n`/roblox-info` — Info detallada de una cuenta de Roblox\n`/arrestar` — Registra un arresto\n`/registros-arrestos` — Consulta el historial de arrestos\n`/eliminar-arrestos` — Elimina arrestos de un usuario\n`/multar` — Registra una multa\n`/eliminar-multa` — Elimina multas de un usuario\n`/solicitar-rol` — Solicita un rol al staff\n`c?info` — Información del bot\n\n**Desarrollador:**\n`@vladimirfernan.` — Reportar errores\n\n**Stack:**\n`Discord.js` `TypeScript` `SQLite (better-sqlite3)`")
        .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: message.guild?.iconURL() ?? "" }).setTimestamp();
      return void message.channel.send({ embeds: [embed] });
    }
    if (command === "help" || command === "ayuda") {
      const embed = new EmbedBuilder().setColor(0x00c851).setTitle("Argentina Roleplay — Información General")
        .setDescription("**Información**\nEsto es una guía básica del servidor. Usá `c?info` para ver todos los comandos disponibles.\n\n**Comandos principales**\n\n`/verificar` — Verifica a un usuario en el servidor.\n\n`/entorno` — Registra el entorno de tu personaje en el roleplay.")
        .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: message.guild?.iconURL() ?? "" }).setTimestamp();
      return void message.channel.send({ embeds: [embed] });
    }
    if (command === "faq") {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("PREGUNTAS FRECUENTES | FAQ")
        .setDescription("Por este medio te dejamos las respuestas a las preguntas más frecuentes de nuestra comunidad.\n\nPresioná en la barra **\"Preguntas Frecuentes\"** que aparece debajo de este mensaje. Una vez que la presiones se desplegarán las preguntas disponibles; al hacer clic en una de ellas verás su respuesta.\n\nRecordá siempre seguir los procedimientos indicados.")
        .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: message.guild?.iconURL() ?? "" }).setTimestamp();
      const selectMenu = new StringSelectMenuBuilder().setCustomId("faq_select").setPlaceholder("Preguntas Frecuentes").addOptions(FAQ_MENUS.map((item) => ({ label: item.label, value: item.value, description: item.description })));
      return void message.channel.send({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)] });
    }
    if (command === "tecnicatura") {
      if (!message.member?.roles.cache.has(ROL_MODERADOR)) return void message.channel.send({ content: "No tenés los permisos necesarios para usar este comando." });
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Tecnicaturas | Argentina RP")
        .setDescription("A continuación, encontrarán distintos roles que les permitirán acceder a diferentes **Equipos Técnicos**.\n\nLos roles de **Encargado de DNI**, **Control Faccionario** y **Encargado de Verificaciones** requieren una **postulación previa**, la cual deberá ser aprobada por los **Altos Mandos del STAFF** o, en su defecto, por los **Holders**.")
        .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC", iconURL: message.guild?.iconURL() ?? "" }).setTimestamp();
      const selectMenu = new StringSelectMenuBuilder().setCustomId("tecnicatura_select").setPlaceholder("Seleccionar Tecnicatura").setMinValues(1).setMaxValues(7)
        .addOptions([
          { label: "Encargado DNI",            value: "enc_dni",      description: "Rol de Encargado de DNI.",                   emoji: "🪪" },
          { label: "Asistente Verificaciones",  value: "asist_verif",  description: "Rol de Asistente de Verificaciones.",        emoji: "✅" },
          { label: "Encargado Eventos",         value: "enc_eventos",  description: "Rol de Encargado de Eventos.",               emoji: "🎉" },
          { label: "Encargado Lic. Conducir",   value: "enc_lic",      description: "Rol de Encargado de Licencias de Conducir.", emoji: "🚗" },
          { label: "Permiso Roles",             value: "perm_roles",   description: "Permiso para gestionar roles.",              emoji: "🔧" },
          { label: "Permiso Dinero",            value: "perm_dinero",  description: "Permiso para gestionar dinero.",             emoji: "💰" },
          { label: "Permiso Roblox",            value: "perm_roblox",  description: "Permiso para gestionar Roblox.",             emoji: "🎮" },
          { label: "Control Faccionario",       value: "disabled_cf",  description: "No estás habilitado, realizá una prueba primero." },
          { label: "Encargado CKs",             value: "disabled_cks", description: "Solo puede tenerlo si eres Senior Administrador en adelante." },
        ]);
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      if (fs.existsSync(LOGO_PATH)) {
        const logoFile = new AttachmentBuilder(LOGO_PATH, { name: "logo_argrp.png" });
        embed.setThumbnail("attachment://logo_argrp.png");
        return void message.channel.send({ embeds: [embed], files: [logoFile], components: [row] });
      }
      embed.setThumbnail(message.guild?.iconURL() ?? null);
      return void message.channel.send({ embeds: [embed], components: [row] });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  client.on("interactionCreate", async (interaction) => {

    // ── AUTOCOMPLETE ──────────────────────────────────────────────────────
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (focused.name !== "usuario_roblox") { await interaction.respond([]); return; }
      const query = focused.value?.trim() ?? "";
      if (query.length < 2) { await interaction.respond([]); return; }
      try {
        const results = await searchRobloxUsers(query);
        await interaction.respond(results.slice(0, 10).map((u) => ({ name: `${u.name} (${u.id})`, value: u.name })));
      } catch { await interaction.respond([]); }
      return;
    }

    // ── MODALS ────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("rechazar_modal_")) {
        const pendingKey = interaction.customId.replace("rechazar_modal_", "");
        const pending    = pendingSolicitudes.get(pendingKey);
        if (!pending) return interaction.reply({ content: "Esta solicitud ya expiró.", ephemeral: true });
        if (!hasStaffSolicitudesRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos para rechazar solicitudes.", ephemeral: true });
        const motivoRechazo = interaction.fields.getTextInputValue("motivo_rechazo");
        pendingSolicitudes.delete(pendingKey);
        const rolNombre = ROLES_DISPONIBLES.find((r) => r.value === pending.rolId)?.name ?? pending.rolName;
        const rechazadoEmbed = new EmbedBuilder().setColor(0xed4245)
          .setTitle("<a:Reprobado:1399874121055076372> | La solicitud ha sido denegada.")
          .setDescription(`<:Ehh:1457908929504870475> | Su solicitud de solicitar el rol **${rolNombre}** ha sido rechazada por el Moderador **${interaction.user.tag}** por el siguiente motivo: ${motivoRechazo}`)
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        await interaction.reply({ content: `<@${pending.requesterId}>`, embeds: [rechazadoEmbed] });
        return;
      }
      return;
    }

    // ── SELECT MENUS ──────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "faq_select") {
        const selected = FAQ_MENUS.find((item) => item.value === interaction.values[0]);
        if (!selected) return interaction.reply({ content: "No se encontró la respuesta.", ephemeral: true });
        const embed = new EmbedBuilder().setColor(0x5865f2).setDescription(selected.response).setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: interaction.guild?.iconURL() ?? "" }).setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      if (interaction.customId === "tecnicatura_select") {
        const selected    = interaction.values;
        const hasDisabled = selected.some((v) => DISABLED_VALUES.includes(v));
        if (hasDisabled) return interaction.reply({ content: "Uno o más de los roles seleccionados no están disponibles para vos en este momento.", ephemeral: true });
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener el servidor.", ephemeral: true });
        try {
          const member = await guild.members.fetch(interaction.user.id);
          const rolesAdded: string[] = [];
          for (const value of selected) {
            const entry = TECNICATURA_MAP[value];
            if (!entry) continue;
            if (!member.roles.cache.has(entry.roleId)) await member.roles.add(entry.roleId);
            rolesAdded.push(entry.label);
          }
          if (rolesAdded.length === 0) return interaction.reply({ content: "Ya tenés todos los roles seleccionados en tu perfil.", ephemeral: true });
          const listaRoles = rolesAdded.map((r) => `**${r}**`).join(", ");
          return interaction.reply({ content: rolesAdded.length === 1 ? `✅ | El rol de tecnicatura ${listaRoles} ha sido añadido a tu perfil exitosamente.` : `✅ | Los roles de tecnicatura ${listaRoles} han sido añadidos a tu perfil exitosamente.`, ephemeral: true });
        } catch (error: any) { return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true }); }
      }
      if (interaction.customId.startsWith("arrestos_cargos_")) {
        // Solo visualización — el select muestra los cargos en su descripción
        return interaction.reply({ content: "Podés ver los cargos en la descripción de cada opción del menú.", ephemeral: true });
      }
      return;
    }

    // ── BUTTONS ───────────────────────────────────────────────────────────
    if (interaction.isButton()) {

      // Lista Staff
      if (interaction.customId.startsWith("lista_staff_")) {
        await interaction.deferUpdate();
        try {
          const guild = interaction.guild; if (!guild) return;
          await guild.members.fetch();
          if (interaction.customId === "lista_staff_postulantes") {
            const arr  = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(ROL_POSTULANTE_STAFF)).values());
            const list = arr.length > 0 ? arr.map((m, i) => `**${i + 1}.** <@${m.id}>`).join("\n") : "<a:Reprobado:1399874121055076372> | No hay postulantes registrados.";
            const embed = new EmbedBuilder().setColor(0xed4245).setTitle("<:Soporte:1467253761377304850> | Lista de Staff").addFields({ name: "⛑️ | Postulantes Staff", value: list, inline: false }).setFooter({ text: `Total: ${arr.length} postulantes` }).setTimestamp();
            return void interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("lista_staff_moderadores").setLabel("Moderadores").setStyle(ButtonStyle.Primary))] });
          } else if (interaction.customId === "lista_staff_moderadores") {
            const arr  = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(ROL_MODERADOR)).values());
            const list = arr.length > 0 ? arr.map((m, i) => `**${i + 1}.** <@${m.id}>`).join("\n") : "<a:Reprobado:1399874121055076372> | No hay moderadores registrados.";
            const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("<:Soporte:1467253761377304850> | Lista de Staff").addFields({ name: "<:Moderadores:1473981745689923728> | Moderadores", value: list, inline: false }).setFooter({ text: `Total: ${arr.length} moderadores` }).setTimestamp();
            return void interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("lista_staff_postulantes").setLabel("⛑️ | Postulantes").setStyle(ButtonStyle.Danger))] });
          }
        } catch (error: any) { console.error("Error en navegación lista staff:", error); }
        return;
      }

      // Saludar — un saludo por usuario
      if (interaction.customId.startsWith("saludar_")) {
        const targetId = interaction.customId.replace("saludar_", "");
        if (!saludosDados.has(targetId)) saludosDados.set(targetId, new Set());
        const yaLoDio = saludosDados.get(targetId)!;
        if (yaLoDio.has(interaction.user.id)) return interaction.reply({ content: "<a:Reprobado:1399874121055076372> | Ya le has dado la bienvenida a este usuario, no intentes spamear el saludo.", ephemeral: true });
        yaLoDio.add(interaction.user.id);
        try { await interaction.reply({ content: `👋🏻 | El usuario ${interaction.user} te da la Bienvenida, disfruta de tu estadía.` }); } catch (e) { console.error("Error en saludar:", e); }
        return;
      }

      // Verificar SI
      if (interaction.customId.startsWith("verificar_si_")) {
        const pendingKey = interaction.customId.replace("verificar_si_", "");
        const pending    = pendingVerifications.get(pendingKey);
        if (!pending) return interaction.update({ content: "La sesión de verificación expiró. Ejecutá el comando nuevamente.", embeds: [], components: [] });
        if (interaction.user.id !== pending.moderatorId) return interaction.reply({ content: "<a:Nerd:1357113815623536791> | Solo el moderador que ejecutó el comando puede confirmar la verificación.", ephemeral: true });
        pendingVerifications.delete(pendingKey);
        await interaction.deferUpdate();
        try {
          const guild = interaction.guild; if (!guild) return interaction.editReply({ content: "Error al obtener información del servidor.", embeds: [], components: [] });
          let targetMember; try { targetMember = await guild.members.fetch(pending.targetUserId); } catch { return interaction.editReply({ content: "<a:Reprobado:1399874121055076372> | El usuario no está en el servidor.", embeds: [], components: [] }); }
          await targetMember.roles.remove(ROL_NO_VERIFICADO).catch(() => {});
          await targetMember.roles.add(ROL_CIUDADANO);
          await targetMember.setNickname(pending.usuarioRoblox);
          const confirmadoEmbed = new EmbedBuilder().setColor(0x00c851).setDescription(`<a:Aprobado:1399874076402778122> | El usuario <@${pending.targetUserId}> ha sido verificado exitosamente.\nSe le agregó el rol <@&${ROL_CIUDADANO}> y se eliminó el rol <@&${ROL_NO_VERIFICADO}>.`).setTimestamp().setFooter({ text: `Verificado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
          await interaction.editReply({ embeds: [confirmadoEmbed], components: [] });
          const bienvenidaEmbed = new EmbedBuilder().setColor(0x00c851).setTitle("<a:Aprobado:1399874076402778122> | ¡Bienvenido a Argentina Roleplay!").setDescription(`<a:check1:1468762093741412553> | Bienvenido a Argentina RP, si eres nuevo te recomiendo leer <#1349870170734333956> <#1350162245187010731> <#1349870170734333957> Tambien recuerda que si tienes alguna duda ve a <#1350160761653170246> 👀`).setThumbnail(pending.fullBodyUrl).setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
          const bienvenidaChannel = await client.channels.fetch(CANAL_BIENVENIDA);
          if (bienvenidaChannel instanceof TextChannel || bienvenidaChannel instanceof NewsChannel) {
            await bienvenidaChannel.send({ content: `<@${pending.targetUserId}>`, embeds: [bienvenidaEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`saludar_${pending.targetUserId}`).setLabel("Saludar").setStyle(ButtonStyle.Success))] });
          }
          try {
            await targetMember.send({ embeds: [bienvenidaEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel("Reglas Roleplay").setStyle(ButtonStyle.Link).setURL("https://docs.google.com/document/d/19G2DCFIH32MWgfYgMVF7HjUf30Y0i-v4h-0QvYi3gm4/edit?tab=t.0"))] });
          } catch { console.log(`No se pudo enviar DM de bienvenida a ${pending.targetUserId}.`); }
        } catch (error: any) { console.error("Error en verificar_si:", error); return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\``, embeds: [], components: [] }); }
        return;
      }

      // Verificar NO
      if (interaction.customId.startsWith("verificar_no_")) {
        const pendingKey = interaction.customId.replace("verificar_no_", "");
        const pending    = pendingVerifications.get(pendingKey);
        if (!pending) return interaction.update({ content: "La sesión de verificación expiró.", embeds: [], components: [] });
        if (interaction.user.id !== pending.moderatorId) return interaction.reply({ content: "Solo el moderador que ejecutó el comando puede cancelar la verificación.", ephemeral: true });
        pendingVerifications.delete(pendingKey);
        return interaction.update({ content: "Verificación cancelada. Revisá el usuario de Roblox e intentá nuevamente.", embeds: [], components: [] });
      }

      // Solicitar Rol — Aceptar
      if (interaction.customId.startsWith("solicitud_aceptar_")) {
        const pendingKey = interaction.customId.replace("solicitud_aceptar_", "");
        const pending    = pendingSolicitudes.get(pendingKey);
        if (!pending) return interaction.reply({ content: "Esta solicitud ya fue procesada o expiró.", ephemeral: true });
        if (!hasStaffSolicitudesRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos para aceptar solicitudes.", ephemeral: true });
        pendingSolicitudes.delete(pendingKey);
        const rolNombre = ROLES_DISPONIBLES.find((r) => r.value === pending.rolId)?.name ?? pending.rolName;
        await interaction.update({ components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("noop_a").setLabel("Aceptar").setStyle(ButtonStyle.Success).setDisabled(true), new ButtonBuilder().setCustomId("noop_r").setLabel("Rechazar").setStyle(ButtonStyle.Danger).setDisabled(true))] });
        try {
          const guild = interaction.guild;
          if (guild) {
            const m = await guild.members.fetch(pending.requesterId).catch(() => null);
            if (m) { const rolEncontrado = guild.roles.cache.find((r) => r.name.toLowerCase() === rolNombre.toLowerCase()); if (rolEncontrado) await m.roles.add(rolEncontrado.id).catch(() => {}); }
          }
        } catch { /* no bloqueante */ }
        const aceptadoEmbed = new EmbedBuilder().setColor(0x00c851).setTitle("<a:Aprobado:1399874076402778122> | La solicitud ha sido aprobada.").setDescription(`<:Miembro:1473969750139994112> | La solicitud de <@${pending.requesterId}> ha sido aceptada por el Moderador **${interaction.user.tag}** exitosamente, el rol **${rolNombre}** ha sido agregado a su perfil.`).setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        await interaction.followUp({ content: `<@${pending.requesterId}>`, embeds: [aceptadoEmbed] });
        return;
      }

      // Solicitar Rol — Rechazar (modal)
      if (interaction.customId.startsWith("solicitud_rechazar_")) {
        const pendingKey = interaction.customId.replace("solicitud_rechazar_", "");
        const pending    = pendingSolicitudes.get(pendingKey);
        if (!pending) return interaction.reply({ content: "Esta solicitud ya fue procesada o expiró.", ephemeral: true });
        if (!hasStaffSolicitudesRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos para rechazar solicitudes.", ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`rechazar_modal_${pendingKey}`).setTitle("Motivo de Rechazo");
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("motivo_rechazo").setLabel("Motivo del rechazo").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
        await interaction.showModal(modal);
        return;
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SLASH COMMANDS
    // ══════════════════════════════════════════════════════════════════════
    if (!interaction.isChatInputCommand()) return;

    // /calificar-staff
    if (interaction.commandName === "calificar-staff") {
      if (interaction.channelId !== CANAL_CALIFICAR_STAFF) return interaction.reply({ content: `Este comando solo se puede usar en <#${CANAL_CALIFICAR_STAFF}>`, ephemeral: true });
      const staffUser = interaction.options.getUser("staff", true);
      const estrellas = interaction.options.getInteger("estrellas", true);
      const nota      = interaction.options.getString("opinion_personal", true);
      try {
        const guild = interaction.guild; if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const staffMember = await guild.members.fetch(staffUser.id);
        if (!staffMember.roles.cache.has(ROL_MODERADOR)) return interaction.reply({ content: "El usuario mencionado no es Moderador. Por favor intentalo de nuevo.", ephemeral: true });
        await storage.createCalificacion({ staffUserId: staffUser.id, calificadorUserId: interaction.user.id, estrellas, nota });
        const totalCalificaciones = await storage.countCalificacionesByStaff(staffUser.id);
        const promedioEstrellas   = await storage.getPromedioEstrellasByStaff(staffUser.id);
        const embed = new EmbedBuilder().setColor(0xffd700).setTitle("<:chik:1473970031489454100> | Calificación Staff — Registrada").setDescription("Gracias por tu calificación.")
          .addFields({ name: "<:Miembro:1473969750139994112> | Usuario", value: `${interaction.user}`, inline: true }, { name: "<:Moderadores:1473981745689923728> | Staff calificado", value: `${staffUser}`, inline: true }, { name: "<a:Nerd:1357113815623536791> | Estrellas", value: "⭐".repeat(estrellas), inline: true }, { name: "<a:dancergb:1357113390413123775> | Opinión personal", value: nota, inline: false }, { name: "<a:Aprobado:1399874076402778122> | Estadísticas", value: `${totalCalificaciones} calificaciones · Promedio: ${promedioEstrellas}/5`, inline: false })
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        const canalDestino = await client.channels.fetch(CANAL_DESTINO_CALIFICACIONES);
        if (canalDestino instanceof TextChannel || canalDestino instanceof NewsChannel) await canalDestino.send({ content: `<@${staffUser.id}>`, embeds: [embed] });
        return interaction.reply({ content: "<a:Aprobado:1399874076402778122> | Tu calificación ha sido enviada correctamente.", ephemeral: true });
      } catch (error: any) { return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true }); }
    }

    // /añadir-rol
    if (interaction.commandName === "añadir-rol") {
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR)) return interaction.reply({ content: "<a:Nerd:1357113815623536791> | No tenés los permisos necesarios para este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const rol        = interaction.options.getRole("rol", true);
      try {
        const guild = interaction.guild; if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetUser.id);
        if (targetMember.roles.cache.has(rol.id)) return interaction.reply({ content: `<:adv:1468761911821602947> | El usuario ${targetUser} ya tiene el rol ${rol}.`, ephemeral: true });
        await targetMember.roles.add(rol.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00c851).setTitle("Rol Añadido").setDescription(`<a:Aprobado:1399874076402778122> | El rol <@&${rol.id}> ha sido añadido a ${targetUser} exitosamente.`).setTimestamp().setFooter({ text: `Ejecutado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })], allowedMentions: { roles: [] } });
      } catch (error: any) { return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true }); }
    }

    // /eliminar-rol
    if (interaction.commandName === "eliminar-rol") {
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR)) return interaction.reply({ content: "<a:Nerd:1357113815623536791> | No tenés los permisos necesarios para este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const rol        = interaction.options.getRole("rol", true);
      try {
        const guild = interaction.guild; if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetUser.id);
        if (!targetMember.roles.cache.has(rol.id)) return interaction.reply({ content: `<:adv:1468761911821602947> | El usuario ${targetUser} no tiene el rol ${rol}.`, ephemeral: true });
        await targetMember.roles.remove(rol.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("Rol Eliminado").setDescription(`<a:Aprobado:1399874076402778122> | El rol <@&${rol.id}> ha sido eliminado del perfil de ${targetUser} exitosamente.`).setTimestamp().setFooter({ text: `Ejecutado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })], allowedMentions: { roles: [] } });
      } catch (error: any) { return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true }); }
    }

    // /muted
    if (interaction.commandName === "muted") {
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR_MUTE)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No sos Moderador. No podés usar este comando.", ephemeral: true });
      const targetUser  = interaction.options.getUser("usuario", true);
      const tiempoTexto = interaction.options.getString("tiempo", true);
      const motivo      = interaction.options.getString("motivo", true);
      try {
        const guild = interaction.guild; if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetUser.id);
        function parseTiempo(texto: string): number | null {
          const match = texto.match(/(\d+)\s*(segundo|segundos|minuto|minutos|hora|horas|día|días|dia|dias)/i);
          if (!match) return null;
          const cantidad = parseInt(match[1]); const unidad = match[2].toLowerCase();
          if (unidad.includes("segundo")) return cantidad * 1000;
          if (unidad.includes("minuto"))  return cantidad * 60 * 1000;
          if (unidad.includes("hora"))    return cantidad * 60 * 60 * 1000;
          if (unidad.includes("día") || unidad.includes("dia")) return cantidad * 24 * 60 * 60 * 1000;
          return null;
        }
        const duracionMs = parseTiempo(tiempoTexto);
        if (!duracionMs) return interaction.reply({ content: "<:equiz:1468761969518706708> | Formato de tiempo inválido. Usá: `1 hora`, `30 minutos`, `2 días`, etc.", ephemeral: true });
        await targetMember.timeout(duracionMs, `${motivo} — Por: ${interaction.user.tag}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("Usuario Silenciado").setDescription(`${interaction.user} silenció a ${targetUser} por **${tiempoTexto}**.\n**Motivo:** ${motivo}`).setTimestamp().setFooter({ text: "Sistema de Moderación" })] });
        try { await targetUser.send({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("Has sido silenciado").setDescription(`Fuiste silenciado en **${guild.name}** por **${tiempoTexto}**.\n\n**Motivo:** ${motivo}`).setFooter({ text: "Si creés que es un error, contactá al staff." }).setTimestamp()] }); } catch { console.log(`No se pudo enviar DM a ${targetUser.username}.`); }
      } catch (error: any) { return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true }); }
    }

    // /lista-staff
    if (interaction.commandName === "lista-staff") {
      try {
        const guild = interaction.guild; if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        await interaction.deferReply(); await guild.members.fetch();
        const arr  = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(ROL_MODERADOR)).values());
        const list = arr.length > 0 ? arr.map((m, i) => `**${i + 1}.** <@${m.id}>`).join("\n") : "<a:cargando:1456888296381874207> | No hay moderadores registrados.";
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("<:Soporte:1467253761377304850> | Lista de Staff").addFields({ name: "<:Moderadores:1473981745689923728> | Moderadores", value: list, inline: false }).setFooter({ text: `Total: ${arr.length} moderadores` }).setTimestamp()], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("lista_staff_postulantes").setLabel("⛑️ | Postulantes").setStyle(ButtonStyle.Danger))] });
      } catch { return interaction.editReply({ content: "Error al cargar la lista." }); }
    }

    // /verificar
    if (interaction.commandName === "verificar") {
      if (interaction.channelId !== CANAL_VERIFICAR) return interaction.reply({ content: `<:adv:1468761911821602947> | Este comando solo se puede usar en <#${CANAL_VERIFICAR}>`, ephemeral: true });
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser    = interaction.options.getUser("usuario", true);
      const usuarioRoblox = interaction.options.getString("usuario_roblox", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const roblox = await getRobloxData(usuarioRoblox);
        if (!roblox) return interaction.editReply({ content: `<:equiz:1468761969518706708> | No se encontró el usuario de Roblox: **${usuarioRoblox}**.` });
        const pendingKey = `verificar_${interaction.user.id}_${Date.now()}`;
        pendingVerifications.set(pendingKey, { targetUserId: targetUser.id, usuarioRoblox: roblox.name, avatarUrl: roblox.avatarUrl, fullBodyUrl: roblox.fullBodyUrl, moderatorId: interaction.user.id });
        setTimeout(() => pendingVerifications.delete(pendingKey), 5 * 60 * 1000);
        const confirmEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("<:adv:1468761911821602947> | ¿Este es el usuario correcto?").setDescription("<a:Nerd:1357113815623536791> | Para asegurarnos que sea el usuario de Roblox correcto, verifica si la imagen de la derecha coincide con el avatar del usuario.").setThumbnail(roblox.fullBodyUrl).addFields({ name: "Usuario de Discord", value: `${targetUser}`, inline: true }, { name: "Usuario de Roblox", value: roblox.name, inline: true }).setTimestamp();
        return interaction.editReply({ embeds: [confirmEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`verificar_si_${pendingKey}`).setLabel("Si").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`verificar_no_${pendingKey}`).setLabel("No").setStyle(ButtonStyle.Danger))] });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /entorno
    if (interaction.commandName === "entorno") {
      const lugar         = interaction.options.getString("lugar", true);
      const entornoDesc   = interaction.options.getString("entorno", true);
      const usuarioRoblox = interaction.options.getString("usuario_roblox", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const roblox = await getRobloxData(usuarioRoblox);
        if (!roblox) return interaction.editReply({ content: `No se encontró el usuario de Roblox: **${usuarioRoblox}**.` });
        const entornoEmbed = new EmbedBuilder().setColor(0x2b2d31).setTitle("<a:dancergb:1357113390413123775> | Registro de Entorno").setThumbnail(roblox.fullBodyUrl)
          .addFields({ name: "<:discord:1468196272199569410> | Usuario de Discord", value: `${interaction.user}`, inline: true }, { name: "<:roblox:1468196317514956905> | Usuario de Roblox", value: `[${roblox.name}](https://www.roblox.com/users/${roblox.id}/profile)`, inline: true }, { name: "\u200B", value: "\u200B", inline: false }, { name: "<a:fijado:1468193352439824384> | Lugar", value: lugar, inline: true }, { name: "<a:cargando:1456888296381874207> | Entorno", value: entornoDesc, inline: false })
          .setFooter({ text: `Registrado por ${interaction.user.tag} · Argentina RP┊ER:LC`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
        const entornoChannel = await client.channels.fetch(CANAL_ENTORNO);
        if (!(entornoChannel instanceof TextChannel) && !(entornoChannel instanceof NewsChannel)) return interaction.editReply({ content: "No se pudo acceder al canal de entorno. Contactá a un administrador." });
        await entornoChannel.send({ embeds: [entornoEmbed] });
        return interaction.editReply({ content: `<a:check1:1468762093741412553> | Tu entorno ha sido registrado exitosamente en <#${CANAL_ENTORNO}>.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /roblox-info
    if (interaction.commandName === "roblox-info") {
      const usuarioRobloxInput = interaction.options.getString("usuario_roblox", false);
      await interaction.deferReply();
      try {
        let robloxBasic: { id: number; name: string; avatarUrl: string; fullBodyUrl: string } | null = null;
        if (usuarioRobloxInput) {
          robloxBasic = await getRobloxData(usuarioRobloxInput);
          if (!robloxBasic) return interaction.editReply({ content: `No se encontró el usuario de Roblox: **${usuarioRobloxInput}**.` });
        } else {
          const guild      = interaction.guild;
          const execMember = guild ? await guild.members.fetch(interaction.user.id).catch(() => null) : null;
          robloxBasic = await getRobloxFromNickname(execMember?.nickname ?? interaction.user.username);
          if (!robloxBasic) robloxBasic = await getRobloxData(interaction.user.username);
          if (!robloxBasic) return interaction.editReply({ content: `<:equiz:1468761969518706708> | No se pudo detectar tu cuenta de Roblox automáticamente. Por favor indicá tu nombre de usuario en el campo \`usuario_roblox\`.` });
        }
        const info = await getRobloxUserInfo(robloxBasic.id);
        if (!info) return interaction.editReply({ content: `No se pudo obtener la información completa del usuario de Roblox.` });
        const descripcionTruncada = info.description.length > 300 ? info.description.substring(0, 297) + "..." : info.description;
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe8082c).setTitle(`<:config:1473970137089445909> | ${info.displayName} (@${info.name})`).setURL(info.profileUrl).setThumbnail(info.fullBodyUrl).setDescription(descripcionTruncada).addFields({ name: "<:chik:1473970031489454100> | ID", value: String(info.id), inline: true }, { name: "<:config:1473970137089445909> | Creado el", value: info.created, inline: true }, { name: "<:BAN:1350470431441682514> | Baneado", value: info.isBanned ? "Sí" : "No", inline: true }, { name: "\u200B", value: "\u200B", inline: false }, { name: "<:Miembro:1473969750139994112> | Amigos", value: String(info.friendCount), inline: true }, { name: "<a:check1:1468762093741412553> | Seguidores", value: String(info.followerCount), inline: true }, { name: "<a:cargando:1456888296381874207> | Siguiendo", value: String(info.followingCount), inline: true }, { name: "<:enlaces:1468199583418155197> | Perfil", value: `[Ver en Roblox](${info.profileUrl})`, inline: false }).setFooter({ text: `Consultado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp()] });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // ── /arrestar ─────────────────────────────────────────────────────────
    if (interaction.commandName === "arrestar") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser  = interaction.options.getUser("usuario", true);
      const cargos      = interaction.options.getString("cargos", true);
      const fotoArresto = interaction.options.getAttachment("foto-arresto", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        let robloxName = targetUser.username, robloxUrl = "", robloxThumb = "";
        if (guild) {
          const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
          const robloxData   = await getRobloxFromNickname(targetMember?.nickname ?? targetUser.username);
          if (robloxData) { robloxName = robloxData.name; robloxUrl = `https://www.roblox.com/users/${robloxData.id}/profile`; robloxThumb = robloxData.avatarUrl; }
        }

        // ✅ Persistir en SQLite
        insertArresto({ userId: targetUser.id, userTag: targetUser.tag, robloxName, robloxUrl, cargos, oficialId: interaction.user.id, oficialTag: interaction.user.tag, fotoUrl: fotoArresto.url, fecha: fechaHoy() });

        const arrestoEmbed = new EmbedBuilder().setColor(0xed4245).setTitle("<:BAN:1350470431441682514> | Registro de Arresto").setImage(fotoArresto.url)
          .addFields({ name: "<:Miembro:1473969750139994112> | Detenido (Discord)", value: `${targetUser}`, inline: true }, { name: "<:roblox:1468196317514956905> | Usuario Roblox", value: robloxUrl ? `[${robloxName}](${robloxUrl})` : robloxName, inline: true }, { name: "\u200B", value: "\u200B", inline: false }, { name: "<:adv:1468761911821602947> | Cargos", value: cargos, inline: false }, { name: "<:Moderadores:1473981745689923728> | Oficial", value: `${interaction.user}`, inline: true }, { name: "<a:cargando:1456888296381874207> | Fecha", value: fechaHoy(), inline: true })
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        if (robloxThumb) arrestoEmbed.setThumbnail(robloxThumb);

        const arrestoChannel = await client.channels.fetch(CANAL_ARRESTOS);
        if (arrestoChannel instanceof TextChannel || arrestoChannel instanceof NewsChannel) await arrestoChannel.send({ embeds: [arrestoEmbed] });

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("<:BAN:1350470431441682514> | LOG — Arresto Registrado").addFields({ name: "Detenido", value: `${targetUser} (${targetUser.id})`, inline: true }, { name: "Roblox", value: robloxName, inline: true }, { name: "Cargos", value: cargos, inline: false }, { name: "Oficial", value: `${interaction.user}`, inline: true }, { name: "Fecha", value: fechaHoraAhora(), inline: true }).setFooter({ text: "Sistema de Registros — Argentina RP" }).setTimestamp()] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Arresto registrado correctamente en <#${CANAL_ARRESTOS}>.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // ── /registros-arrestos ───────────────────────────────────────────────
    if (interaction.commandName === "registros-arrestos") {
      const targetUser = interaction.options.getUser("usuario", false) ?? interaction.user;
      await interaction.deferReply();
      try {
        const guild = interaction.guild;
        let robloxName = targetUser.username, robloxUrl = "", robloxThumb = "";
        if (guild) {
          const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
          const robloxData   = await getRobloxFromNickname(targetMember?.nickname ?? targetUser.username);
          if (robloxData) { robloxName = robloxData.name; robloxUrl = `https://www.roblox.com/users/${robloxData.id}/profile`; robloxThumb = robloxData.avatarUrl; }
        }

        // ✅ Leer desde SQLite
        const historial     = getArrestosByUser(targetUser.id);
        const totalArrestos = historial.length;

        const registroEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("<:BAN:1350470431441682514> | Historial de Arrestos")
          .addFields({ name: "<:Miembro:1473969750139994112> | Usuario Discord", value: `${targetUser}`, inline: true }, { name: "<:roblox:1468196317514956905> | Usuario Roblox", value: robloxUrl ? `[${robloxName}](${robloxUrl})` : robloxName, inline: true }, { name: "<a:Nerd:1357113815623536791> | Total de arrestos", value: String(totalArrestos), inline: false })
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        if (robloxThumb) registroEmbed.setThumbnail(robloxThumb);

        const components: any[] = [];
        if (historial.length > 0) {
          // Máximo 25 opciones en Discord select menu
          const ultimos = historial.slice(0, 25);
          const selectCargos = new StringSelectMenuBuilder().setCustomId(`arrestos_cargos_${targetUser.id}`).setPlaceholder("Cargos Mayores — Ver historial")
            .addOptions(ultimos.map((a) => ({ label: `Arresto #${a.id} — ${a.fecha}`, value: `cargo_${a.id}`, description: a.cargos.length > 100 ? a.cargos.substring(0, 97) + "..." : a.cargos })));
          components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectCargos));
        }
        return interaction.editReply({ embeds: [registroEmbed], components });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // ── /eliminar-arrestos ────────────────────────────────────────────────
    if (interaction.commandName === "eliminar-arrestos") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const motivo     = interaction.options.getString("motivo", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        // ✅ Eliminar desde SQLite
        const cantidadBorrada = deleteArrestosByUser(targetUser.id);

        insertLog({ tipo: "arresto", userId: targetUser.id, userTag: targetUser.tag, cantidad: cantidadBorrada, motivo, ejecutadoBy: `${interaction.user.tag} (${interaction.user.id})`, fecha: fechaHoraAhora() });

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("<a:Reprobado:1399874121055076372> | LOG — Arrestos Eliminados").addFields({ name: "Usuario", value: `${targetUser} (${targetUser.id})`, inline: true }, { name: "Arrestos borrados", value: String(cantidadBorrada), inline: true }, { name: "Motivo", value: motivo, inline: false }, { name: "Ejecutado por", value: `${interaction.user}`, inline: true }, { name: "Fecha", value: fechaHoraAhora(), inline: true }).setFooter({ text: "Sistema de Registros — Argentina RP" }).setTimestamp()] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Se eliminaron **${cantidadBorrada}** arresto(s) de ${targetUser} de la base de datos.\n**Motivo:** ${motivo}` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // ── /multar ───────────────────────────────────────────────────────────
    if (interaction.commandName === "multar") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const cargos     = interaction.options.getString("cargos", true);
      const fotoMulta  = interaction.options.getAttachment("foto-multa", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        let robloxName = targetUser.username, robloxUrl = "", robloxThumb = "";
        if (guild) {
          const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
          const robloxData   = await getRobloxFromNickname(targetMember?.nickname ?? targetUser.username);
          if (robloxData) { robloxName = robloxData.name; robloxUrl = `https://www.roblox.com/users/${robloxData.id}/profile`; robloxThumb = robloxData.avatarUrl; }
        }

        // ✅ Persistir en SQLite
        insertMulta({ userId: targetUser.id, userTag: targetUser.tag, robloxName, robloxUrl, cargos, oficialId: interaction.user.id, oficialTag: interaction.user.tag, fotoUrl: fotoMulta.url, fecha: fechaHoy() });

        const multaEmbed = new EmbedBuilder().setColor(0xff6600).setTitle("<:adv:1468761911821602947> | Registro de Multa").setImage(fotoMulta.url)
          .addFields({ name: "<:Miembro:1473969750139994112> | Multado (Discord)", value: `${targetUser}`, inline: true }, { name: "<:roblox:1468196317514956905> | Usuario Roblox", value: robloxUrl ? `[${robloxName}](${robloxUrl})` : robloxName, inline: true }, { name: "\u200B", value: "\u200B", inline: false }, { name: "<:adv:1468761911821602947> | Cargos / Infracción", value: cargos, inline: false }, { name: "<:Moderadores:1473981745689923728> | Oficial", value: `${interaction.user}`, inline: true }, { name: "<a:cargando:1456888296381874207> | Fecha", value: fechaHoy(), inline: true })
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        if (robloxThumb) multaEmbed.setThumbnail(robloxThumb);

        const multaChannel = await client.channels.fetch(CANAL_MULTAS);
        if (multaChannel instanceof TextChannel || multaChannel instanceof NewsChannel) await multaChannel.send({ embeds: [multaEmbed] });

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("<:adv:1468761911821602947> | LOG — Multa Registrada").addFields({ name: "Multado", value: `${targetUser} (${targetUser.id})`, inline: true }, { name: "Roblox", value: robloxName, inline: true }, { name: "Cargos", value: cargos, inline: false }, { name: "Oficial", value: `${interaction.user}`, inline: true }, { name: "Fecha", value: fechaHoraAhora(), inline: true }).setFooter({ text: "Sistema de Registros — Argentina RP" }).setTimestamp()] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Multa registrada correctamente en <#${CANAL_MULTAS}>.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // ── /eliminar-multa ───────────────────────────────────────────────────
    if (interaction.commandName === "eliminar-multa") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const motivo     = interaction.options.getString("motivo", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        // ✅ Eliminar desde SQLite
        const cantidadBorrada = deleteMultasByUser(targetUser.id);

        insertLog({ tipo: "multa", userId: targetUser.id, userTag: targetUser.tag, cantidad: cantidadBorrada, motivo, ejecutadoBy: `${interaction.user.tag} (${interaction.user.id})`, fecha: fechaHoraAhora() });

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("<a:Reprobado:1399874121055076372> | LOG — Multas Eliminadas").addFields({ name: "Usuario", value: `${targetUser} (${targetUser.id})`, inline: true }, { name: "Multas borradas", value: String(cantidadBorrada), inline: true }, { name: "Motivo", value: motivo, inline: false }, { name: "Ejecutado por", value: `${interaction.user}`, inline: true }, { name: "Fecha", value: fechaHoraAhora(), inline: true }).setFooter({ text: "Sistema de Registros — Argentina RP" }).setTimestamp()] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Se eliminaron **${cantidadBorrada}** multa(s) de ${targetUser} de la base de datos.\n**Motivo:** ${motivo}` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // ── /solicitar-rol ────────────────────────────────────────────────────
    if (interaction.commandName === "solicitar-rol") {
      const rolValue  = interaction.options.getString("nombre-rol", true);
      const motivo    = interaction.options.getString("motivo", true);
      const pruebas   = interaction.options.getAttachment("pruebas", true);
      const rolNombre = ROLES_DISPONIBLES.find((r) => r.value === rolValue)?.name ?? rolValue;
      await interaction.deferReply({ ephemeral: true });
      try {
        const pendingKey = `solicitud_${interaction.user.id}_${Date.now()}`;
        pendingSolicitudes.set(pendingKey, { requesterId: interaction.user.id, rolId: rolValue, rolName: rolNombre, motivo, pruebasUrl: pruebas.url });
        setTimeout(() => pendingSolicitudes.delete(pendingKey), 24 * 60 * 60 * 1000);

        const solicitudEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("<a:cargando:1456888296381874207> | Nueva Solicitud de Rol").setImage(pruebas.url)
          .addFields({ name: "<:Miembro:1473969750139994112> | Solicitante", value: `${interaction.user}`, inline: true }, { name: "<:config:1473970137089445909> | Rol solicitado", value: rolNombre, inline: true }, { name: "\u200B", value: "\u200B", inline: false }, { name: "<a:dancergb:1357113390413123775> | Motivo", value: motivo, inline: false })
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();

        const solicitudChannel = await client.channels.fetch(CANAL_SOLICITAR_ROL);
        if (solicitudChannel instanceof TextChannel || solicitudChannel instanceof NewsChannel) {
          await solicitudChannel.send({ content: `<@&${ROL_STAFF_SOLICITUDES}>`, embeds: [solicitudEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`solicitud_aceptar_${pendingKey}`).setLabel("Aceptar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`solicitud_rechazar_${pendingKey}`).setLabel("Rechazar").setStyle(ButtonStyle.Danger))] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Tu solicitud para el rol **${rolNombre}** ha sido enviada correctamente. El staff revisará tu solicitud próximamente.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

  });

  client.login(DISCORD_TOKEN);
  return httpServer;
}
