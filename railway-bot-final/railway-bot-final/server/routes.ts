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

const pendingVerifications = new Map<string, {
  targetUserId:  string;
  usuarioRoblox: string;
  avatarUrl:     string;
  fullBodyUrl:   string;
  moderatorId:   string;
}>();

const saludosDados = new Map<string, Set<string>>();

const pendingSolicitudes = new Map<string, {
  requesterId:      string;
  rolId:            string;
  rolName:          string;
  motivo:           string;
  pruebasUrl:       string;
  requesterTag:     string;
  requesterAvatar:  string;
  trabajosActuales: number;
  limiteTrabajos:   number;
  messageId?:       string;
  channelId?:       string;
}>();

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

function calcularGastos(texto: string): { detalle: string; total: string } {
  const matches = texto.match(/p\/\s*[\d.,]+/gi);
  if (!matches || matches.length === 0) {
    return { detalle: "Sin gastos especificados.", total: "p/0" };
  }
  const montos: number[] = matches.map((m) => {
    const raw = m.replace(/p\/\s*/i, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(raw);
    return isNaN(num) ? 0 : num;
  });
  const total        = montos.reduce((a, b) => a + b, 0);
  const detalle      = matches.map((m) => `\`${m.replace(/\s/g, "")}\``).join(", ");
  const totalFormato = `**p/${total.toLocaleString("es-AR")}**`;
  return { detalle, total: totalFormato };
}

async function getRobloxData(username: string): Promise<{ id: number; name: string; avatarUrl: string; fullBodyUrl: string } | null> {
  try {
    const userRes  = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
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

const ROLES_TRABAJOS_PRIMARIOS: { id: string; nombre: string; emoji: string }[] = [
  { id: "1436174608339566777", nombre: "Juez - Fiscal",                  emoji: "💼" },
  { id: "1349870169337368664", nombre: "Abogado",                        emoji: "💼" },
  { id: "1353392018201509960", nombre: "Brigada Especial de Halcón",     emoji: "🦅" },
  { id: "1349870169362661440", nombre: "Policía Federal Argentina",      emoji: "🚓" },
  { id: "1387584047685046312", nombre: "Policía de la Ciudad",           emoji: "🚓" },
  { id: "1349870169362661439", nombre: "Gendarmeria Nacional Argentina", emoji: "🪖" },
  { id: "1349870169337368667", nombre: "SAME",                           emoji: "🚑" },
  { id: "1349870169337368666", nombre: "Bomberos de la Ciudad",          emoji: "🚒" },
  { id: "1355583720622657676", nombre: "Automovil Club Argentino",       emoji: "🚧" },
];

const ROLES_VIP_TRABAJOS = ["1350294370766557254", "1350294391130165321", "1356372171751948288"];

const ROLES_TRABAJOS_SECUNDARIOS: string[] = [
  "1350128958477172796", "1349870169337368660", "1454866615094218823",
  "1463214222430306316", "1391969382237732965", "1474753287675973745",
  "1396137541761241248", "1396873933008932924", "1396136805904158722",
  "1393609761987104888", "1396874236290793664", "1396138087834452091",
  "1396138356307656774", "1396136280940871773", "1454141465134497908",
  "1405028691809013831", "1407065612555129003",
];

const ROLES_DISPONIBLES = ROLES_TRABAJOS_PRIMARIOS.map((r) => ({
  name:  r.emoji + "|| " + r.nombre,
  value: r.id,
}));

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

  const commands = [
    new SlashCommandBuilder().setName("calificar-staff").setDescription("Califica el desempeño de un miembro del staff.")
      .addUserOption((o) => o.setName("staff").setDescription("Miembro del staff a calificar.").setRequired(true))
      .addIntegerOption((o) => o.setName("estrellas").setDescription("Calificación de 1 a 5 estrellas.").setRequired(true).addChoices({ name: "⭐", value: 1 }, { name: "⭐⭐", value: 2 }, { name: "⭐⭐⭐", value: 3 }, { name: "⭐⭐⭐⭐", value: 4 }, { name: "⭐⭐⭐⭐⭐", value: 5 }))
      .addStringOption((o) => o.setName("opinion_personal").setDescription("Explica por qué das esta calificación.").setRequired(true).setMaxLength(500)),
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
      .addStringOption((o) => o.setName("cargos").setDescription("Cargos del arresto. (mín. 15, máx. 5000 caracteres)").setRequired(true).setMaxLength(5000).setMinLength(15))
      .addAttachmentOption((o) => o.setName("foto-arresto").setDescription("Foto del arresto como prueba.").setRequired(true)),
    new SlashCommandBuilder().setName("registros-arrestos").setDescription("Muestra los registros de arrestos de un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a consultar (opcional).").setRequired(false)),
    new SlashCommandBuilder().setName("eliminar-arrestos").setDescription("Elimina los arrestos de un usuario de la base de datos.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminarán los arrestos.").setRequired(true))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la eliminación.").setRequired(true).setMaxLength(500)),
    new SlashCommandBuilder().setName("multar").setDescription("Registra una multa a un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario multado.").setRequired(true))
      .addStringOption((o) => o.setName("cargos").setDescription("Cargos de la multa. (mín. 15, máx. 5000 caracteres)").setRequired(true).setMaxLength(5000).setMinLength(15))
      .addAttachmentOption((o) => o.setName("foto-multa").setDescription("Foto de la multa como prueba.").setRequired(true)),
    new SlashCommandBuilder().setName("eliminar-multa").setDescription("Elimina las multas de un usuario de la base de datos.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminarán las multas.").setRequired(true))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo de la eliminación.").setRequired(true).setMaxLength(500)),
    new SlashCommandBuilder().setName("solicitar-rol").setDescription("Solicita un rol al staff.")
      .addStringOption((o) => o.setName("nombre-rol").setDescription("Rol que deseas solicitar.").setRequired(true).addChoices(...ROLES_DISPONIBLES.map((r) => ({ name: r.name, value: r.value }))))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo de tu solicitud.").setRequired(true).setMaxLength(500))
      .addAttachmentOption((o) => o.setName("pruebas").setDescription("Foto con las pruebas de tu solicitud.").setRequired(true)),
    new SlashCommandBuilder().setName("info-discord").setDescription("Muestra información y estadísticas de un usuario del servidor.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a consultar (opcional, por defecto sos vos).").setRequired(false)),
    new SlashCommandBuilder().setName("eliminar-trabajo").setDescription("Elimina un trabajo primario de un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminará el trabajo.").setRequired(true))
      .addStringOption((o) => o.setName("trabajo").setDescription("Trabajo a eliminar.").setRequired(true).addChoices(
        { name: "💼|| Juez - Fiscal",                  value: "1436174608339566777" },
        { name: "💼|| Abogado",                        value: "1349870169337368664" },
        { name: "🦅|| Brigada Especial de Halcón",     value: "1353392018201509960" },
        { name: "🚓|| Policía Federal Argentina",      value: "1349870169362661440" },
        { name: "🚓|| Policía de la Ciudad",           value: "1387584047685046312" },
        { name: "🪖|| Gendarmeria Nacional Argentina", value: "1349870169362661439" },
        { name: "🚑|| SAME",                           value: "1349870169337368667" },
        { name: "🚒|| Bomberos de la Ciudad",          value: "1349870169337368666" },
        { name: "🚧|| Automovil Club Argentino",       value: "1355583720622657676" },
      )),
  ];

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    console.log("Base de datos PostgreSQL iniciada correctamente.");
    const statuses = [
      { name: "Developer: @vladimirfernan.", type: ActivityType.Watching },
      { name: "TikTok: Argentina_rperlc",    type: ActivityType.Watching },
    ];
    let si = 0;
    const tick = () => { const s = statuses[si++ % statuses.length]; client.user?.setPresence({ activities: [{ name: s.name, type: s.type }], status: "online" }); };
    tick(); setInterval(tick, 15_000);
    try {
      const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
      if (client.user?.id) {
        const appId   = client.user.id;
        const guildId = "1349870169056350270";
        await rest.put(Routes.applicationCommands(appId), { body: [] });
        await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: [] });
        await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
        console.log("Slash commands registrados en el servidor.");
      }
    } catch (e) { console.error(e); }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const PREFIX = "c?";
    if (!message.content.startsWith(PREFIX)) return;
    const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (!isTextChannel(message.channel)) return;

    if (command === "info") {
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("Información General — Bot Argentina RP")
        .setDescription("**Comandos disponibles:**\n`/calificar-staff` — Califica al staff\n`/verificar` — Verifica a un usuario\n`/entorno` — Registra el entorno de tu personaje\n`/roblox-info` — Info detallada de una cuenta de Roblox\n`/arrestar` — Registra un arresto\n`/registros-arrestos` — Consulta el historial de arrestos\n`/eliminar-arrestos` — Elimina arrestos de un usuario\n`/multar` — Registra una multa\n`/eliminar-multa` — Elimina multas de un usuario\n`/solicitar-rol` — Solicita un rol al staff\n`c?info` — Información del bot\n\n**Desarrollador:**\n`@vladimirfernan.` — Reportar errores\n\n**Stack:**\n`Discord.js` `TypeScript` `PostgreSQL + Drizzle ORM`")
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

  client.on("interactionCreate", async (interaction) => {

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

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("rechazar_modal_")) {
        const pendingKey    = interaction.customId.replace("rechazar_modal_", "");
        const pending       = pendingSolicitudes.get(pendingKey);
        if (!pending) return interaction.reply({ content: "Esta solicitud ya expiró.", ephemeral: true });
        if (!hasStaffSolicitudesRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos para rechazar solicitudes.", ephemeral: true });
        const motivoRechazo = interaction.fields.getTextInputValue("motivo_rechazo");
        pendingSolicitudes.delete(pendingKey);
        if (pending.messageId && pending.channelId) {
          try {
            const ch = await client.channels.fetch(pending.channelId);
            if (ch instanceof TextChannel || ch instanceof NewsChannel) {
              const msg = await ch.messages.fetch(pending.messageId);
              const editedEmbed = EmbedBuilder.from(msg.embeds[0])
                .setColor(0xed4245)
                .addFields(
                  { name: "<a:Reprobado:1399874121055076372> | Rechazado por", value: `${interaction.user} (${interaction.user.tag})`, inline: true },
                  { name: "<:adv:1468761911821602947> | Motivo", value: motivoRechazo, inline: false }
                );
              await msg.edit({ embeds: [editedEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("noop_a").setLabel("Aceptar").setStyle(ButtonStyle.Success).setDisabled(true), new ButtonBuilder().setCustomId("noop_r").setLabel("Rechazar").setStyle(ButtonStyle.Danger).setDisabled(true))] });
            }
          } catch { }
        }
        await interaction.reply({ ephemeral: true, content: `<a:Aprobado:1399874076402778122> | Solicitud rechazada correctamente.` });
        return;
      }
      return;
    }

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
        return interaction.reply({ content: "Podés ver los cargos en la descripción de cada opción del menú.", ephemeral: true });
      }
      return;
    }

    if (interaction.isButton()) {

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

      if (interaction.customId.startsWith("saludar_")) {
        const targetId = interaction.customId.replace("saludar_", "");
        if (!saludosDados.has(targetId)) saludosDados.set(targetId, new Set());
        const yaLoDio = saludosDados.get(targetId)!;
        if (yaLoDio.has(interaction.user.id)) return interaction.reply({ content: "<a:Reprobado:1399874121055076372> | Ya le has dado la bienvenida a este usuario, no intentes spamear el saludo.", ephemeral: true });
        yaLoDio.add(interaction.user.id);
        try { await interaction.reply({ content: `👋🏻 | El usuario ${interaction.user} te da la Bienvenida, disfruta de tu estadía.` }); } catch (e) { console.error("Error en saludar:", e); }
        return;
      }

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

      if (interaction.customId.startsWith("verificar_no_")) {
        const pendingKey = interaction.customId.replace("verificar_no_", "");
        const pending    = pendingVerifications.get(pendingKey);
        if (!pending) return interaction.update({ content: "La sesión de verificación expiró.", embeds: [], components: [] });
        if (interaction.user.id !== pending.moderatorId) return interaction.reply({ content: "Solo el moderador que ejecutó el comando puede cancelar la verificación.", ephemeral: true });
        pendingVerifications.delete(pendingKey);
        return interaction.update({ content: "Verificación cancelada. Revisá el usuario de Roblox e intentá nuevamente.", embeds: [], components: [] });
      }

      if (interaction.customId.startsWith("solicitud_aceptar_")) {
        const pendingKey = interaction.customId.replace("solicitud_aceptar_", "");
        const pending    = pendingSolicitudes.get(pendingKey);
        if (!pending) return interaction.reply({ content: "Esta solicitud ya fue procesada o expiró.", ephemeral: true });
        if (!hasStaffSolicitudesRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos para aceptar solicitudes.", ephemeral: true });
        pendingSolicitudes.delete(pendingKey);
        try {
          const guild = interaction.guild;
          if (guild) {
            const m = await guild.members.fetch(pending.requesterId).catch(() => null);
            if (m) await m.roles.add(pending.rolId).catch(() => {});
          }
        } catch { }
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("noop_a").setLabel("Aceptar").setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId("noop_r").setLabel("Rechazar").setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        const editedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x00c851)
          .addFields({ name: "<a:Aprobado:1399874076402778122> | Aceptado por", value: `${interaction.user} (${interaction.user.tag})`, inline: false });
        await interaction.update({ embeds: [editedEmbed], components: [disabledRow] });
        await interaction.followUp({ content: `<a:Aprobado:1399874076402778122> | Solicitud de <@${pending.requesterId}> aceptada. Rol <@&${pending.rolId}> asignado.`, ephemeral: true });
        return;
      }

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
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Usuario",             value: `${interaction.user}`, inline: true },
            { name: "<:Moderadores:1473981745689923728> | Staff calificado", value: `${staffUser}`, inline: true },
            { name: "<a:Nerd:1357113815623536791> | Estrellas",             value: "⭐".repeat(estrellas), inline: true },
            { name: "<a:dancergb:1357113390413123775> | Opinión personal",  value: nota, inline: false },
            { name: "<a:Aprobado:1399874076402778122> | Estadísticas",      value: `${totalCalificaciones} calificaciones · Promedio: ${promedioEstrellas}/5`, inline: false }
          )
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        const canalDestino = await client.channels.fetch(CANAL_DESTINO_CALIFICACIONES);
        if (canalDestino instanceof TextChannel || canalDestino instanceof NewsChannel) await canalDestino.send({ content: `<@${staffUser.id}>`, embeds: [embed] });
        return interaction.reply({ content: "<a:Aprobado:1399874076402778122> | Tu calificación ha sido enviada correctamente.", ephemeral: true });
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
        const confirmEmbed = new EmbedBuilder().setColor(0x5865f2).setTitle("<:adv:1468761911821602947> | ¿Este es el usuario correcto?").setDescription("<a:Nerd:1357113815623536791> | Para asegurarnos que sea el usuario de Roblox correcto, verifica si la imagen de la derecha coincide con el avatar del usuario.").setThumbnail(roblox.fullBodyUrl)
          .addFields(
            { name: "Usuario de Discord", value: `${targetUser}`, inline: true },
            { name: "Usuario de Roblox",  value: roblox.name,    inline: true }
          ).setTimestamp();
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
          .addFields(
            { name: "<:discord:1468196272199569410> | Usuario de Discord", value: `${interaction.user}`, inline: true },
            { name: "<:roblox:1468196317514956905> | Usuario de Roblox",   value: `[${roblox.name}](https://www.roblox.com/users/${roblox.id}/profile)`, inline: true },
            { name: "<a:fijado:1468193352439824384> | Lugar",              value: lugar, inline: false },
            { name: "<a:cargando:1456888296381874207> | Entorno",          value: entornoDesc, inline: false }
          )
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
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe8082c).setTitle(`<:config:1473970137089445909> | ${info.displayName} (@${info.name})`).setURL(info.profileUrl).setThumbnail(info.fullBodyUrl).setDescription(descripcionTruncada)
          .addFields(
            { name: "<:chik:1473970031489454100> | ID",            value: String(info.id),       inline: true },
            { name: "<:config:1473970137089445909> | Creado el",   value: info.created,          inline: true },
            { name: "<:BAN:1350470431441682514> | Baneado",         value: info.isBanned ? "Sí" : "No", inline: true },
            { name: "<:Miembro:1473969750139994112> | Amigos",     value: String(info.friendCount),   inline: true },
            { name: "<a:check1:1468762093741412553> | Seguidores",  value: String(info.followerCount), inline: true },
            { name: "<a:cargando:1456888296381874207> | Siguiendo", value: String(info.followingCount), inline: true },
            { name: "<:enlaces:1468199583418155197> | Perfil",     value: `[Ver en Roblox](${info.profileUrl})`, inline: false }
          )
          .setFooter({ text: `Consultado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp()] });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /arrestar
    if (interaction.commandName === "arrestar") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser  = interaction.options.getUser("usuario", true);
      const cargos      = interaction.options.getString("cargos", true);
      const fotoArresto = interaction.options.getAttachment("foto-arresto", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        let robloxName = targetUser.username, robloxUrl = "";
        if (guild) {
          const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
          const robloxData   = await getRobloxFromNickname(targetMember?.nickname ?? targetUser.username);
          if (robloxData) { robloxName = robloxData.name; robloxUrl = `https://www.roblox.com/users/${robloxData.id}/profile`; }
        }

        // ── Guardar en PostgreSQL ─────────────────────────────────────────
        await insertArresto({ userId: targetUser.id, userTag: targetUser.tag, robloxName, robloxUrl, cargos, oficialId: interaction.user.id, oficialTag: interaction.user.tag, fotoUrl: fotoArresto.url, fecha: fechaHoy() });

        const gastos        = calcularGastos(cargos);
        const cargosDisplay = cargos.length > 1024 ? cargos.substring(0, 1021) + "..." : cargos;

        const arrestoEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("<:BAN:1350470431441682514> | Registro de Arresto — Argentina RP")
          .setImage(fotoArresto.url)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Detenido",             value: `${targetUser}\n\`${targetUser.tag}\``, inline: true },
            { name: "<:Moderadores:1473981745689923728> | Oficial a cargo",  value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
            { name: "\u200b",                                                 value: "\u200b", inline: true },
            { name: "<:adv:1468761911821602947> | Cargos aplicados",         value: `\`\`\`${cargosDisplay}\`\`\``, inline: false },
            { name: "<:chik:1473970031489454100> | Gastos totales",          value: gastos.total, inline: true },
            { name: "<a:cargando:1456888296381874207> | Fecha de arresto",   value: `\`${fechaHoy()}\``, inline: true },
          )
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC · Sistema de Arrestos" })
          .setTimestamp();

        const arrestoChannel = await client.channels.fetch(CANAL_ARRESTOS);
        if (arrestoChannel instanceof TextChannel || arrestoChannel instanceof NewsChannel) {
          await arrestoChannel.send({ embeds: [arrestoEmbed] });
        }

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("<:config:1473970137089445909> | LOG — Nuevo Arresto Registrado")
            .setThumbnail(targetUser.displayAvatarURL())
            .setImage(fotoArresto.url)
            .addFields(
              { name: "<:Miembro:1473969750139994112> | Arrestado",       value: `${targetUser}\n\`${targetUser.tag}\` · \`${targetUser.id}\``, inline: false },
              { name: "<a:check1:1468762093741412553> | Oficial",          value: `${interaction.user}\n\`${interaction.user.tag}\` · \`${interaction.user.id}\``, inline: false },
              { name: "<:Ehh:1457908929504870475> | Cargos aplicados",    value: `\`\`\`${cargosDisplay}\`\`\``, inline: false },
              { name: "<:chik:1473970031489454100> | Gastos detectados",  value: gastos.detalle, inline: true },
              { name: "💰 | Total acumulado",                              value: gastos.total, inline: true },
              { name: "<a:cargando:1456888296381874207> | Fecha y hora",  value: `\`${fechaHoraAhora()}\``, inline: false },
            )
            .setFooter({ text: "Sistema de Registros — Argentina RP · Arresto" })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }

        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Arresto registrado correctamente en <#${CANAL_ARRESTOS}>.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /registros-arrestos
    if (interaction.commandName === "registros-arrestos") {
      const targetUser = interaction.options.getUser("usuario", false) ?? interaction.user;
      await interaction.deferReply();
      try {
        // ── Consultar PostgreSQL ──────────────────────────────────────────
        const historial    = await getArrestosByUser(targetUser.id);
        const totalArrestos = historial.length;
        const todosLosCargos   = historial.map((a) => a.cargos).join(" ");
        const gastosAcumulados = calcularGastos(todosLosCargos);

        const registroEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("<:BAN:1350470431441682514> | Historial de Arrestos — Argentina RP")
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Usuario",           value: `${targetUser}\n\`${targetUser.tag}\``, inline: true },
            { name: "<a:Nerd:1357113815623536791> | Total arrestos",      value: `\`${totalArrestos}\``, inline: true },
            { name: "\u200b",                                              value: "\u200b", inline: true },
            { name: "💰 | Gastos totales acumulados",                     value: gastosAcumulados.total, inline: true },
            { name: "<a:cargando:1456888296381874207> | Última consulta", value: `\`${fechaHoraAhora()}\``, inline: true },
          )
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC · Sistema de Registros" })
          .setTimestamp();

        const components: any[] = [];
        if (historial.length > 0) {
          const ultimos = historial.slice(0, 25);
          const selectCargos = new StringSelectMenuBuilder()
            .setCustomId(`arrestos_cargos_${targetUser.id}`)
            .setPlaceholder("📋 Historial — Seleccioná un arresto para ver sus cargos")
            .addOptions(ultimos.map((a) => ({
              label:       `Arresto #${a.id} — ${a.fecha}`,
              value:       `cargo_${a.id}`,
              description: a.cargos.length > 100 ? a.cargos.substring(0, 97) + "..." : a.cargos,
            })));
          components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectCargos));
        }
        return interaction.editReply({ embeds: [registroEmbed], components });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /eliminar-arrestos
    if (interaction.commandName === "eliminar-arrestos") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const motivo     = interaction.options.getString("motivo", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        // ── Eliminar de PostgreSQL ────────────────────────────────────────
        const cantidadBorrada = await deleteArrestosByUser(targetUser.id);
        await insertLog({ tipo: "arresto", userId: targetUser.id, userTag: targetUser.tag, cantidad: cantidadBorrada, motivo, ejecutadoBy: `${interaction.user.tag} (${interaction.user.id})`, fecha: fechaHoraAhora() });

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xff6600)
            .setTitle("<a:Reprobado:1399874121055076372> | LOG — Arrestos Eliminados")
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: "<:Miembro:1473969750139994112> | Usuario",            value: `${targetUser}\n\`${targetUser.tag}\` · \`${targetUser.id}\``, inline: false },
              { name: "<:BAN:1350470431441682514> | Arrestos borrados",       value: `\`${cantidadBorrada}\``, inline: true },
              { name: "<:adv:1468761911821602947> | Motivo",                  value: motivo, inline: false },
              { name: "<:Moderadores:1473981745689923728> | Ejecutado por",   value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
              { name: "<a:cargando:1456888296381874207> | Fecha",             value: `\`${fechaHoraAhora()}\``, inline: true },
            )
            .setFooter({ text: "Sistema de Registros — Argentina RP · Eliminación de Arrestos" }).setTimestamp()] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Se eliminaron **${cantidadBorrada}** arresto(s) de ${targetUser} de la base de datos.\n**Motivo:** ${motivo}` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /multar
    if (interaction.commandName === "multar") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const cargos     = interaction.options.getString("cargos", true);
      const fotoMulta  = interaction.options.getAttachment("foto-multa", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        let robloxName = targetUser.username, robloxUrl = "";
        if (guild) {
          const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
          const robloxData   = await getRobloxFromNickname(targetMember?.nickname ?? targetUser.username);
          if (robloxData) { robloxName = robloxData.name; robloxUrl = `https://www.roblox.com/users/${robloxData.id}/profile`; }
        }

        // ── Guardar en PostgreSQL ─────────────────────────────────────────
        await insertMulta({ userId: targetUser.id, userTag: targetUser.tag, robloxName, robloxUrl, cargos, oficialId: interaction.user.id, oficialTag: interaction.user.tag, fotoUrl: fotoMulta.url, fecha: fechaHoy() });

        const gastos        = calcularGastos(cargos);
        const cargosDisplay = cargos.length > 1024 ? cargos.substring(0, 1021) + "..." : cargos;

        const multaEmbed = new EmbedBuilder()
          .setColor(0xff6600)
          .setTitle("<:adv:1468761911821602947> | Registro de Multa — Argentina RP")
          .setImage(fotoMulta.url)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Multado",              value: `${targetUser}\n\`${targetUser.tag}\``, inline: true },
            { name: "<:Moderadores:1473981745689923728> | Oficial a cargo",  value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
            { name: "\u200b",                                                 value: "\u200b", inline: true },
            { name: "<:adv:1468761911821602947> | Cargos / Infracción",      value: `\`\`\`${cargosDisplay}\`\`\``, inline: false },
            { name: "<:chik:1473970031489454100> | Gastos totales",          value: gastos.total, inline: true },
            { name: "<a:cargando:1456888296381874207> | Fecha de multa",     value: `\`${fechaHoy()}\``, inline: true },
          )
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC · Sistema de Multas" })
          .setTimestamp();

        const multaChannel = await client.channels.fetch(CANAL_MULTAS);
        if (multaChannel instanceof TextChannel || multaChannel instanceof NewsChannel) {
          await multaChannel.send({ embeds: [multaEmbed] });
        }

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("<:config:1473970137089445909> | LOG — Nueva Multa Registrada")
            .setThumbnail(targetUser.displayAvatarURL())
            .setImage(fotoMulta.url)
            .addFields(
              { name: "<:Miembro:1473969750139994112> | Multado",         value: `${targetUser}\n\`${targetUser.tag}\` · \`${targetUser.id}\``, inline: false },
              { name: "<a:check1:1468762093741412553> | Oficial",          value: `${interaction.user}\n\`${interaction.user.tag}\` · \`${interaction.user.id}\``, inline: false },
              { name: "<:Ehh:1457908929504870475> | Cargos aplicados",    value: `\`\`\`${cargosDisplay}\`\`\``, inline: false },
              { name: "<:chik:1473970031489454100> | Gastos detectados",  value: gastos.detalle, inline: true },
              { name: "💰 | Total acumulado",                              value: gastos.total, inline: true },
              { name: "<a:cargando:1456888296381874207> | Fecha y hora",  value: `\`${fechaHoraAhora()}\``, inline: false },
            )
            .setFooter({ text: "Sistema de Registros — Argentina RP · Multa" })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }

        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Multa registrada correctamente en <#${CANAL_MULTAS}>.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /eliminar-multa
    if (interaction.commandName === "eliminar-multa") {
      if (!hasPoliceRole(interaction.member)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const motivo     = interaction.options.getString("motivo", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        // ── Eliminar de PostgreSQL ────────────────────────────────────────
        const cantidadBorrada = await deleteMultasByUser(targetUser.id);
        await insertLog({ tipo: "multa", userId: targetUser.id, userTag: targetUser.tag, cantidad: cantidadBorrada, motivo, ejecutadoBy: `${interaction.user.tag} (${interaction.user.id})`, fecha: fechaHoraAhora() });

        const logChannel = await client.channels.fetch(CANAL_LOG_REGISTROS);
        if (logChannel instanceof TextChannel || logChannel instanceof NewsChannel) {
          await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xff6600)
            .setTitle("<a:Reprobado:1399874121055076372> | LOG — Multas Eliminadas")
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: "<:Miembro:1473969750139994112> | Usuario",           value: `${targetUser}\n\`${targetUser.tag}\` · \`${targetUser.id}\``, inline: false },
              { name: "<:adv:1468761911821602947> | Multas borradas",       value: `\`${cantidadBorrada}\``, inline: true },
              { name: "<:adv:1468761911821602947> | Motivo",                value: motivo, inline: false },
              { name: "<:Moderadores:1473981745689923728> | Ejecutado por", value: `${interaction.user}\n\`${interaction.user.tag}\``, inline: true },
              { name: "<a:cargando:1456888296381874207> | Fecha",           value: `\`${fechaHoraAhora()}\``, inline: true },
            )
            .setFooter({ text: "Sistema de Registros — Argentina RP · Eliminación de Multas" }).setTimestamp()] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Se eliminaron **${cantidadBorrada}** multa(s) de ${targetUser} de la base de datos.\n**Motivo:** ${motivo}` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /solicitar-rol
    if (interaction.commandName === "solicitar-rol") {
      const rolId    = interaction.options.getString("nombre-rol", true);
      const motivo   = interaction.options.getString("motivo", true);
      const pruebas  = interaction.options.getAttachment("pruebas", true);
      const rolInfo  = ROLES_TRABAJOS_PRIMARIOS.find((r) => r.id === rolId);
      const rolDisplay = rolInfo ? `${rolInfo.emoji}|| ${rolInfo.nombre}` : rolId;
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.editReply({ content: "Error al obtener el servidor." });
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return interaction.editReply({ content: "No se pudo obtener tu información del servidor." });
        const trabajosActuales = ROLES_TRABAJOS_PRIMARIOS.filter((r) => member.roles.cache.has(r.id)).length;
        const esVip = ROLES_VIP_TRABAJOS.some((r) => member.roles.cache.has(r));
        const limiteTrabajos = esVip ? 3 : 2;
        const pendingKey = `solicitud_${interaction.user.id}_${Date.now()}`;
        pendingSolicitudes.set(pendingKey, {
          requesterId: interaction.user.id, rolId, rolName: rolDisplay, motivo,
          pruebasUrl: pruebas.url, requesterTag: interaction.user.tag,
          requesterAvatar: interaction.user.displayAvatarURL(), trabajosActuales, limiteTrabajos,
        });
        setTimeout(() => pendingSolicitudes.delete(pendingKey), 24 * 60 * 60 * 1000);
        const trabajosTexto = `${trabajosActuales}/${limiteTrabajos} trabajos primarios`;
        const solicitudEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("<a:Aprobado:1399874076402778122> | Nueva Solicitud Generada")
          .setThumbnail(interaction.user.displayAvatarURL())
          .setImage(pruebas.url)
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Miembro",            value: `<@${interaction.user.id}>`, inline: true },
            { name: "<a:Nerd:1357113815623536791> | Rol solicitado",       value: `<@&${rolId}>`, inline: true },
            { name: "<:discord:1468196272199569410> | Trabajos primarios", value: trabajosTexto, inline: false },
            { name: "<:adv:1468761911821602947> | Motivo",                 value: motivo, inline: false },
            { name: "<a:check1:1468762093741412553> | Pruebas",            value: "*(foto adjunta abajo)*", inline: false }
          )
          .setFooter({ text: `Solicitud enviada · ${fechaHoraAhora()}` });
        const solicitudChannel = await client.channels.fetch(CANAL_SOLICITAR_ROL);
        if (solicitudChannel instanceof TextChannel || solicitudChannel instanceof NewsChannel) {
          const msg = await solicitudChannel.send({
            embeds: [solicitudEmbed],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId(`solicitud_aceptar_${pendingKey}`).setLabel("Aceptar").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`solicitud_rechazar_${pendingKey}`).setLabel("Rechazar").setStyle(ButtonStyle.Danger)
            )],
          });
          const saved = pendingSolicitudes.get(pendingKey);
          if (saved) { saved.messageId = msg.id; saved.channelId = msg.channelId; }
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | Tu solicitud para el rol <@&${rolId}> ha sido enviada correctamente. El staff la revisará próximamente.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /info-discord
    if (interaction.commandName === "info-discord") {
      const targetUser = interaction.options.getUser("usuario", false) ?? interaction.user;
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.editReply({ content: "Error al obtener el servidor." });
        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.editReply({ content: "<:equiz:1468761969518706708> | No se encontró al usuario en el servidor." });
        const esVip = ROLES_VIP_TRABAJOS.some((r) => member.roles.cache.has(r));
        const primActuales = ROLES_TRABAJOS_PRIMARIOS.filter((r) => member.roles.cache.has(r.id));
        const limitePrim   = esVip ? 3 : 2;
        const listaPrim    = primActuales.length > 0 ? primActuales.map((r) => `${r.emoji}|| **${r.nombre}** (<@&${r.id}>)`).join("\n") : "Sin trabajos primarios.";
        const secActuales  = ROLES_TRABAJOS_SECUNDARIOS.filter((r) => member.roles.cache.has(r));
        const limiteSec    = esVip ? 2 : 1;
        const listaSec     = secActuales.length > 0 ? secActuales.map((r) => `<@&${r}>`).join("\n") : "Sin trabajos secundarios.";
        const embed = new EmbedBuilder()
          .setColor(0x5865f2).setTitle("<:Miembro:1473969750139994112> | Info Discord").setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Usuario",                           value: `${targetUser}`, inline: true },
            { name: "<a:check1:1468762093741412553> | VIP",                               value: esVip ? "<a:Aprobado:1399874076402778122> | Sí" : "<a:Reprobado:1399874121055076372> | No", inline: true },
            { name: `<:uno:1468199771532427264> | Trabajos primarios (${primActuales.length}/${limitePrim})`, value: listaPrim, inline: false },
            { name: `<:dos:1468199817011400838> | Trabajos secundarios (${secActuales.length}/${limiteSec})`, value: listaSec, inline: false },
          )
          .setFooter({ text: `Consultado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

    // /eliminar-trabajo
    if (interaction.commandName === "eliminar-trabajo") {
      if (!hasStaffSolicitudesRole(interaction.member) && !interaction.memberPermissions?.has("ManageRoles")) {
        return interaction.reply({ content: "<:equiz:1468761969518706708> | No tenés los permisos necesarios para usar este comando.", ephemeral: true });
      }
      const targetUser = interaction.options.getUser("usuario", true);
      const rolId      = interaction.options.getString("trabajo", true);
      const rolInfo    = ROLES_TRABAJOS_PRIMARIOS.find((r) => r.id === rolId);
      const rolDisplay = rolInfo ? `${rolInfo.emoji}|| ${rolInfo.nombre}` : rolId;
      await interaction.deferReply({ ephemeral: true });
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.editReply({ content: "Error al obtener el servidor." });
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return interaction.editReply({ content: "<:equiz:1468761969518706708> | No se encontró al usuario en el servidor." });
        if (!targetMember.roles.cache.has(rolId)) {
          return interaction.editReply({ content: `<:adv:1468761911821602947> | El usuario ${targetUser} no tiene el trabajo **${rolDisplay}**.` });
        }
        await targetMember.roles.remove(rolId);
        const embed = new EmbedBuilder()
          .setColor(0xed4245).setTitle("<a:Reprobado:1399874121055076372> | Trabajo Eliminado").setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Usuario",           value: `${targetUser}`, inline: true },
            { name: "<:config:1473970137089445909> | Trabajo eliminado",  value: `<@&${rolId}>`, inline: true },
            { name: "<:Moderadores:1473981745689923728> | Ejecutado por", value: `${interaction.user}`, inline: true },
            { name: "<a:cargando:1456888296381874207> | Fecha",           value: fechaHoraAhora(), inline: true },
          )
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" }).setTimestamp();
        const canal = await client.channels.fetch(CANAL_SOLICITAR_ROL);
        if (canal instanceof TextChannel || canal instanceof NewsChannel) {
          await canal.send({ embeds: [embed] });
        }
        return interaction.editReply({ content: `<a:Aprobado:1399874076402778122> | El trabajo <@&${rolId}> fue eliminado del perfil de ${targetUser} correctamente.` });
      } catch (error: any) { return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` }); }
    }

  });

  client.login(DISCORD_TOKEN);
  return httpServer;
}
