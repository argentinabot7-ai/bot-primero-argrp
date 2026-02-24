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
  PermissionFlagsBits,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextChannel,
  DMChannel,
  NewsChannel,
  ThreadChannel,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.join(process.cwd(), "server");
const LOGO_PATH  = path.join(SCRIPT_DIR, "logo_argrp.png");

// ── Constantes de canales ─────────────────────────────────────────────────────
const CANAL_VER_DNI                = "1349870171564539968";
const CANAL_CALIFICAR_STAFF        = "1349870171564539968";
const CANAL_DESTINO_CALIFICACIONES = "1406301292967628943";
const CANAL_VERIFICAR              = "1458212074453864601";
const CANAL_BIENVENIDA             = "1349870171296108573";
const CANAL_ENTORNO                = "1451324760423268403";
const GUILD_ID                     = "1349870169056350270";

// ── Constantes de roles ───────────────────────────────────────────────────────
const ROL_MODERADOR         = "1349870169756930109";
const ROL_POSTULANTE_STAFF  = "1349870169756930110";
const ROL_MODERADOR_MUTE    = "1349870169756930113";
const ROL_CIUDADANO         = "1349870169232511064";
const ROL_NO_VERIFICADO     = "1349870169232511063";

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

// ── Maps de estado pendiente ──────────────────────────────────────────────────
const pendingVerifications = new Map<string, {
  targetUserId:  string;
  usuarioRoblox: string;
  avatarUrl:     string;
  fullBodyUrl:   string;
  moderatorId:   string;
}>();

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
    const bustData  = await bustRes.json();
    const bodyData  = await bodyRes.json();
    const avatarUrl   = bustData.data?.[0]?.imageUrl ?? "";
    const fullBodyUrl = bodyData.data?.[0]?.imageUrl ?? avatarUrl;

    return { id: userId, name, avatarUrl, fullBodyUrl };
  } catch {
    return null;
  }
}

async function searchRobloxUsers(query: string): Promise<{ id: number; name: string }[]> {
  try {
    const [searchRes, exactRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=10`),
      fetch("https://users.roblox.com/v1/usernames/users", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ usernames: [query], excludeBannedUsers: false }),
      }),
    ]);
    const searchData = await searchRes.json();
    const exactData  = await exactRes.json();
    const searchResults: { id: number; name: string }[] = searchData.data
      ? (searchData.data as any[]).map((u) => ({ id: u.id as number, name: u.name as string }))
      : [];
    const exactResults: { id: number; name: string }[] = exactData.data
      ? (exactData.data as any[]).map((u) => ({ id: u.id as number, name: u.name as string }))
      : [];
    const seen     = new Set<number>();
    const combined: { id: number; name: string }[] = [];
    for (const u of [...exactResults, ...searchResults]) {
      if (!seen.has(u.id)) { seen.add(u.id); combined.push(u); }
    }
    return combined.slice(0, 10);
  } catch {
    return [];
  }
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
  } catch {
    return null;
  }
}

function isTextChannel(ch: any): ch is TextChannel | DMChannel | NewsChannel | ThreadChannel {
  return ch instanceof TextChannel || ch instanceof DMChannel || ch instanceof NewsChannel || ch instanceof ThreadChannel;
}

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ_MENUS = [
  {
    label: "✅ | ¿Cómo me verifico?",
    value: "faq_verificacion",
    description: "Métodos de verificación en la comunidad.",
    response: [
      "**¿CÓMO ME VERIFICO?**",
      "Esta pregunta es bastante común cuando recién ingresas a nuestra comunidad. Acá te dejamos la respuesta de forma clara y directa (visita <#1466630354012999794>).",
      "",
      "**MELONLY**",
      "Visitá el canal <#1457899075427893564>. Encontrarás un embed con dos botones: **Verify with Melonly** y **¿How do I verify?**. Presioná **Verify with Melonly**; si ya tenés tu cuenta de Discord vinculada con Roblox, se te verificará automáticamente. De lo contrario, aparecerá un botón **Verify** que te llevará a la web de Melonly para vincular ambas cuentas.",
      "",
      "**VERIFICACIÓN MANUAL**",
      "Visitá <#1466630354012999794> para obtener información completa. En resumen: dirigite al canal <#1458212074453864601> y enviá la plantilla disponible en **Info-Verificación** completando todos los campos correctamente. Es **obligatorio** adjuntar una foto de tu perfil de Roblox para que los encargados puedan verificarte.",
    ].join("\n"),
  },
  {
    label: "📄 | ¿Cómo crear mi DNI y/o licencia?",
    value: "faq_dni_licencia",
    description: "Información sobre DNI y Licencia de Conducir.",
    response: [
      "**¿CÓMO CREAR MI DNI Y/O LICENCIA?**",
      "",
      "**DOCUMENTO NACIONAL DE IDENTIDAD**",
      "Dirigite al canal <#1472380283348062341> y ejecutá el comando `/crear-dni`. Completá los campos correctamente; el mínimo error puede invalidar tu DNI. Luego se te pedirá información **IC** de tu personaje.",
      "Para visualizar tu DNI usá `/ver-dni` en <#1349870171564539968>. El DNI es **privado**, no lo compartas.",
      "Antes de crearlo, leé atentamente <#1350123157771653191>. Es obligatorio tener el outfit deseado puesto al ejecutar el comando y que la cara no esté cubierta.",
      "",
      "**LICENCIA DE CONDUCIR**",
      "Primero necesitás tener tu DNI creado correctamente. Luego dirigite a <#1352695371121430548> y completá el formulario; te pedirá una imagen de tu DNI. Si es aceptado, recibirás el rol <@&1352694610509693031> automáticamente.",
    ].join("\n"),
  },
  {
    label: "💼 | ¿Cómo consigo un trabajo?",
    value: "faq_trabajo",
    description: "Trabajos primarios y secundarios disponibles.",
    response: [
      "**¿CÓMO CONSIGO UN TRABAJO?**",
      "Si no entendés algo podés consultarlo en <#1350160761653170246>.",
      "",
      "En nuestra comunidad existen dos tipos de trabajos:",
      "",
      "**TRABAJOS PRIMARIOS**",
      "Incluyen: Gendarmería, Policía Federal, Policía de la Ciudad, Brigada Especial Halcón, SAME, Bomberos de la Ciudad, Automóvil Club Argentino y Corte Suprema de Justicia de la Nación. Cuentan con oposiciones, formulario de acceso y sueldos mínimos de hasta **$4.000 pesos** directos a tu economía.",
      "Accesos: <#1465841180049936498> <#1465841380793516255> <#1465842091568660500> <#1465842374096846852> <#1465842838460825760> <#1465867906746286192>",
      "",
      "**TRABAJOS SECUNDARIOS**",
      "Incluyen empresas públicas y privadas: seguridad privada, servicios de atención, empresas de eventos, noticieros y más. También podés trabajar como <@&1349870169337368660> o <@&1350128958477172796> con un sueldo de **$1.500 pesos** por actividad. Las empresas pagan un mínimo de **$5.000 pesos**.",
      "Empresas disponibles: <#1352692574401331230>. Para dudas internas, contactá a soporte mediante Ticket.",
    ].join("\n"),
  },
  {
    label: "🎮 | ¿Cómo me uno a ER:LC?",
    value: "faq_erlc",
    description: "Requisitos y pasos para unirte al servidor privado.",
    response: [
      "**¿CÓMO ME UNO A ER:LC?**",
      "Tenés 3 opciones disponibles directamente en <#1459632267461656910>: acceso directo, servidor listado o código directo.",
      "",
      "Para unirte necesitás ser **Tier 1** en ER:LC, lo que requiere un mínimo de **1 hora** jugada en servidores públicos y **500 XP**. Recomendamos ponerte de Bombero para acumular XP más rápido.",
      "",
      "Si al intentar unirte aparece el error **\"Bloqueado\"**, es probable que tu cuenta de Roblox tenga menos de 1 mes de antigüedad. También te recomendamos unirte a nuestro servidor <#1459294451083251783>.",
    ].join("\n"),
  },
  {
    label: "💎 | ¿Cómo compro membresía y boost?",
    value: "faq_membresia",
    description: "Información sobre membresías y boosters.",
    response: [
      "**¿CÓMO COMPRO MEMBRESÍA Y BOOST?**",
      "Si tenés más dudas, consultá en <#1350160761653170246>.",
      "",
      "**MEMBRESÍAS**",
      "Visitá <#1349870171044708432> para ver los tipos de membresías y sus beneficios. Los beneficios nunca disminuyen, siempre aumentan con el tiempo. Incluyen acceso a sorteos VIP y canales exclusivos.",
      "",
      "**BOOSTERS**",
      "Para realizar un boost, accedé al menú del servidor (barra superior de la lista de canales) y presioná el botón **rosado** que aparece. Los beneficios superan a los de las membresías; podés verlos en <#1349870171044708433>.",
      "Si realizás más de **4 boosts**, la Administración te crea un rol totalmente personalizado. También obtenés roles automáticos y aparecés en la parte superior de la lista de jugadores.",
      "-# El beneficio del ,collect puede aumentar próximamente (boosters).",
    ].join("\n"),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// ── MAIN ─────────────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/stats", async (_req, res) => {
    res.json({ status: "active" });
  });

  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  if (!DISCORD_TOKEN) {
    console.warn("DISCORD_TOKEN is not set. Bot will not start.");
    return httpServer;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // ── Slash commands ────────────────────────────────────────────────────────
  const commands = [
    // /calificar-staff
    new SlashCommandBuilder()
      .setName("calificar-staff")
      .setDescription("Califica el desempeño de un miembro del staff.")
      .addUserOption((o) =>
        o.setName("staff").setDescription("Miembro del staff a calificar.").setRequired(true),
      )
      .addIntegerOption((o) =>
        o.setName("estrellas").setDescription("Calificación de 1 a 5 estrellas.").setRequired(true)
          .addChoices(
            { name: "⭐", value: 1 }, { name: "⭐⭐", value: 2 }, { name: "⭐⭐⭐", value: 3 },
            { name: "⭐⭐⭐⭐", value: 4 }, { name: "⭐⭐⭐⭐⭐", value: 5 },
          ),
      )
      .addStringOption((o) =>
        o.setName("opinion_personal").setDescription("Explica por qué das esta calificación.").setRequired(true).setMaxLength(500),
      ),

    // /añadir-rol
    new SlashCommandBuilder()
      .setName("añadir-rol")
      .setDescription("Añade un rol a un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le añadirá el rol.").setRequired(true))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que se añadirá al usuario.").setRequired(true)),

    // /eliminar-rol
    new SlashCommandBuilder()
      .setName("eliminar-rol")
      .setDescription("Elimina un rol de un usuario.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario al que se le eliminará el rol.").setRequired(true))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que se eliminará del usuario.").setRequired(true)),

    // /lista-staff
    new SlashCommandBuilder()
      .setName("lista-staff")
      .setDescription("Muestra la lista de moderadores y postulantes del staff."),

    // /muted
    new SlashCommandBuilder()
      .setName("muted")
      .setDescription("Silencia a un usuario por un tiempo determinado.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a silenciar.").setRequired(true))
      .addStringOption((o) => o.setName("tiempo").setDescription("Tiempo de silencio (ej: 1 hora, 30 minutos, 2 días).").setRequired(true))
      .addStringOption((o) => o.setName("motivo").setDescription("Motivo del silencio.").setRequired(true).setMaxLength(500)),

    // /verificar
    new SlashCommandBuilder()
      .setName("verificar")
      .setDescription("Verifica a un usuario de la comunidad.")
      .addUserOption((o) => o.setName("usuario").setDescription("Usuario a verificar.").setRequired(true))
      .addStringOption((o) =>
        o.setName("usuario_roblox").setDescription("Nombre de usuario de Roblox (se usará como apodo).").setRequired(true).setAutocomplete(true),
      ),

    // /entorno
    new SlashCommandBuilder()
      .setName("entorno")
      .setDescription("Registra el entorno actual de tu personaje en el roleplay.")
      .addStringOption((o) =>
        o.setName("lugar").setDescription("Lugar donde se encuentra tu personaje (ej: Hospital, Comisaría, Plaza).").setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("entorno").setDescription("Descripción del entorno o situación actual de tu personaje.").setRequired(true).setMaxLength(500),
      )
      .addStringOption((o) =>
        o.setName("usuario_roblox").setDescription("Tu nombre de usuario de Roblox.").setRequired(true).setAutocomplete(true),
      ),

    // /roblox-info
    new SlashCommandBuilder()
      .setName("roblox-info")
      .setDescription("Muestra información detallada de una cuenta de Roblox.")
      .addStringOption((o) =>
        o.setName("usuario_roblox").setDescription("Nombre de usuario de Roblox a consultar.").setRequired(false).setAutocomplete(true),
      ),

    // /ayuda
    new SlashCommandBuilder()
      .setName("ayuda")
      .setDescription("Muestra todos los comandos disponibles del bot."),
  ];

  // ── Ready ─────────────────────────────────────────────────────────────────
  client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);

    const statuses = [
      { name: "Developer: @vladimirfernan.", type: ActivityType.Watching },
      { name: "TikTok: Argentina_rperlc",      type: ActivityType.Watching },
    ];
    let si = 0;
    const tick = () => {
      const s = statuses[si++ % statuses.length];
      client.user?.setPresence({ activities: [{ name: s.name, type: s.type }], status: "online" });
    };
    tick();
    setInterval(tick, 15_000);

    try {
      const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
      if (client.user?.id) {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log("Slash commands registrados.");
      }
    } catch (e) {
      console.error(e);
    }
  });

  // ── Prefix commands ───────────────────────────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const PREFIX = "c?";
    if (!message.content.startsWith(PREFIX)) return;
    const args    = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (!isTextChannel(message.channel)) return;

    // c?info
    if (command === "info") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Información General — Bot Argentina RP")
        .setDescription(
          "**Comandos disponibles:**\n" +
          "`/calificar-staff` — Califica al staff\n" +
          "`/verificar` — Verifica a un usuario\n" +
          "`/entorno` — Registra el entorno de tu personaje\n" +
          "`/roblox-info` — Info detallada de una cuenta de Roblox\n" +
          "`/ayuda` — Lista completa de comandos\n" +
          "`c?info` — Información del bot\n\n" +
          "**Desarrollador:**\n`@vladimirfernan.` — Reportar errores\n\n" +
          "**Lenguajes:**\n`Discord.js` `TypeScript`",
        )
        .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: message.guild?.iconURL() ?? "" })
        .setTimestamp();
      return void message.channel.send({ embeds: [embed] });
    }

    // c?help / c?ayuda (prefix)
    if (command === "help" || command === "ayuda") {
      const embed = new EmbedBuilder()
        .setColor(0x00c851)
        .setTitle("Argentina Roleplay — Informacion General")
        .setDescription(
          "**Información**\n" +
          "Esto es una guía básica del servidor. Usá `/ayuda` para ver todos los comandos disponibles.\n\n" +
          "**Comandos principales**\n\n" +
          "`/verificar` — Verifica a un usuario en el servidor.\n\n" +
          "`/entorno` — Registra el entorno de tu personaje en el roleplay.",
        )
        .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: message.guild?.iconURL() ?? "" })
        .setTimestamp();
      return void message.channel.send({ embeds: [embed] });
    }

    // c?faq
    if (command === "faq") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("PREGUNTAS FRECUENTES | FAQ")
        .setDescription(
          "Por este medio te dejamos las respuestas a las preguntas más frecuentes de nuestra comunidad.\n\n" +
          "Presioná en la barra **\"Preguntas Frecuentes\"** que aparece debajo de este mensaje. " +
          "Una vez que la presiones se desplegarán las preguntas disponibles; al hacer clic en una de ellas verás su respuesta.\n\n" +
          "Recordá siempre seguir los procedimientos indicados.",
        )
        .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: message.guild?.iconURL() ?? "" })
        .setTimestamp();
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("faq_select")
        .setPlaceholder("Preguntas Frecuentes")
        .addOptions(FAQ_MENUS.map((item) => ({ label: item.label, value: item.value, description: item.description })));
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      return void message.channel.send({ embeds: [embed], components: [row] });
    }

    // c?tecnicatura
    if (command === "tecnicatura") {
      if (!message.member?.roles.cache.has(ROL_MODERADOR)) {
        return void message.channel.send({ content: "No tenés los permisos necesarios para usar este comando." });
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Tecnicaturas | Argentina RP")
        .setDescription(
          "A continuación, encontrarán distintos roles que les permitirán acceder a diferentes **Equipos Técnicos**.\n\n" +
          "Los roles de **Encargado de DNI**, **Control Faccionario** y **Encargado de Verificaciones** " +
          "requieren una **postulación previa**, la cual deberá ser aprobada por los **Altos Mandos del STAFF** " +
          "o, en su defecto, por los **Holders**.",
        )
        .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC", iconURL: message.guild?.iconURL() ?? "" })
        .setTimestamp();
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("tecnicatura_select")
        .setPlaceholder("Seleccionar Tecnicatura")
        .setMinValues(1)
        .setMaxValues(7)
        .addOptions([
          { label: "Encargado DNI",           value: "enc_dni",      description: "Rol de Encargado de DNI.",                   emoji: "🪪" },
          { label: "Asistente Verificaciones", value: "asist_verif",  description: "Rol de Asistente de Verificaciones.",        emoji: "✅" },
          { label: "Encargado Eventos",        value: "enc_eventos",  description: "Rol de Encargado de Eventos.",               emoji: "🎉" },
          { label: "Encargado Lic. Conducir",  value: "enc_lic",      description: "Rol de Encargado de Licencias de Conducir.", emoji: "🚗" },
          { label: "Permiso Roles",            value: "perm_roles",   description: "Permiso para gestionar roles.",              emoji: "🔧" },
          { label: "Permiso Dinero",           value: "perm_dinero",  description: "Permiso para gestionar dinero.",             emoji: "💰" },
          { label: "Permiso Roblox",           value: "perm_roblox",  description: "Permiso para gestionar Roblox.",             emoji: "🎮" },
          { label: "Control Faccionario",      value: "disabled_cf",  description: "No estás habilitado, realizá una prueba primero." },
          { label: "Encargado CKs",            value: "disabled_cks", description: "Solo puede tenerlo si eres Senior Administrador en adelante." },
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
  // ── INTERACTIONS ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  client.on("interactionCreate", async (interaction) => {

    // ══════════════════════════════════════════════════════════════════════
    // AUTOCOMPLETE
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (focused.name !== "usuario_roblox") { await interaction.respond([]); return; }
      const query = focused.value?.trim() ?? "";
      if (query.length < 2) { await interaction.respond([]); return; }
      try {
        const results = await searchRobloxUsers(query);
        await interaction.respond(results.slice(0, 10).map((u) => ({ name: `${u.name} (${u.id})`, value: u.name })));
      } catch {
        await interaction.respond([]);
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SELECT MENUS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isStringSelectMenu()) {

      if (interaction.customId === "faq_select") {
        const selected = FAQ_MENUS.find((item) => item.value === interaction.values[0]);
        if (!selected) return interaction.reply({ content: "No se encontró la respuesta.", ephemeral: true });
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(selected.response)
          .setFooter({ text: "Todos los derechos reservados 2026, Argentina Roleplay.", iconURL: interaction.guild?.iconURL() ?? "" })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (interaction.customId === "tecnicatura_select") {
        const selected    = interaction.values;
        const hasDisabled = selected.some((v) => DISABLED_VALUES.includes(v));
        if (hasDisabled) return interaction.reply({ content: "Uno o más de los roles seleccionados no están disponibles para vos en este momento.", ephemeral: true });
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener el servidor.", ephemeral: true });
        try {
          const member       = await guild.members.fetch(interaction.user.id);
          const rolesAdded: string[] = [];
          for (const value of selected) {
            const entry = TECNICATURA_MAP[value];
            if (!entry) continue;
            if (!member.roles.cache.has(entry.roleId)) await member.roles.add(entry.roleId);
            rolesAdded.push(entry.label);
          }
          if (rolesAdded.length === 0) return interaction.reply({ content: "Ya tenés todos los roles seleccionados en tu perfil.", ephemeral: true });
          const listaRoles   = rolesAdded.map((r) => `**${r}**`).join(", ");
          const mensajeFinal = rolesAdded.length === 1
            ? `✅ | El rol de tecnicatura ${listaRoles} ha sido añadido a tu perfil exitosamente.`
            : `✅ | Los roles de tecnicatura ${listaRoles} han sido añadidos a tu perfil exitosamente.`;
          return interaction.reply({ content: mensajeFinal, ephemeral: true });
        } catch (error: any) {
          return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true });
        }
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // BUTTONS
    // ══════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {

      // ── Lista Staff — navegación ──────────────────────────────────────
      if (interaction.customId.startsWith("lista_staff_")) {
        await interaction.deferUpdate();
        try {
          const guild = interaction.guild;
          if (!guild) return;
          await guild.members.fetch();

          if (interaction.customId === "lista_staff_postulantes") {
            const arr   = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(ROL_POSTULANTE_STAFF)).values());
            const list  = arr.length > 0
              ? arr.map((m, i) => `**${i + 1}.** <@${m.id}>`).join("\n")
              : "<a:Reprobado:1399874121055076372> | No hay postulantes registrados.";
            const embed = new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("<:Soporte:1467253761377304850> | Lista de Staff")
              .addFields({ name: "⛑️ | Postulantes Staff", value: list, inline: false })
              .setFooter({ text: `Total: ${arr.length} postulantes` })
              .setTimestamp();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId("lista_staff_moderadores").setLabel("Moderadores").setStyle(ButtonStyle.Primary),
            );
            return void interaction.editReply({ embeds: [embed], components: [row] });

          } else if (interaction.customId === "lista_staff_moderadores") {
            const arr   = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(ROL_MODERADOR)).values());
            const list  = arr.length > 0
              ? arr.map((m, i) => `**${i + 1}.** <@${m.id}>`).join("\n")
              : "<a:Reprobado:1399874121055076372> | No hay moderadores registrados.";
            const embed = new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle("<:Soporte:1467253761377304850> | Lista de Staff")
              .addFields({ name: "<:Moderadores:1473981745689923728> | Moderadores", value: list, inline: false })
              .setFooter({ text: `Total: ${arr.length} moderadores` })
              .setTimestamp();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId("lista_staff_postulantes").setLabel("⛑️ | Postulantes").setStyle(ButtonStyle.Danger),
            );
            return void interaction.editReply({ embeds: [embed], components: [row] });
          }
        } catch (error: any) {
          console.error("Error en navegación lista staff:", error);
        }
        return;
      }

      if (interaction.customId.startsWith("saludar_")) {
        try {
          await interaction.reply({ content: `👋🏻 | El usuario ${interaction.user} te da la Bienvenida, disfruta de tu estadía.` });
        } catch (error: any) {
          console.error("Error en saludar:", error);
        }
        return;
      }

      // Verificar — SI
      if (interaction.customId.startsWith("verificar_si_")) {
        const pendingKey = interaction.customId.replace("verificar_si_", "");
        const pending    = pendingVerifications.get(pendingKey);
        if (!pending) return interaction.update({ content: "La sesión de verificación expiró. Ejecutá el comando nuevamente.", embeds: [], components: [] });
        if (interaction.user.id !== pending.moderatorId) return interaction.reply({ content: "<a:Nerd:1357113815623536791> | Solo el moderador que ejecutó el comando puede confirmar la verificación.", ephemeral: true });

        pendingVerifications.delete(pendingKey);
        await interaction.deferUpdate();

        try {
          const guild = interaction.guild;
          if (!guild) return interaction.editReply({ content: "Error al obtener información del servidor.", embeds: [], components: [] });
          let targetMember;
          try {
            targetMember = await guild.members.fetch(pending.targetUserId);
          } catch {
            return interaction.editReply({ content: "<a:Reprobado:1399874121055076372> | El usuario no está en el servidor.", embeds: [], components: [] });
          }
          await targetMember.roles.remove(ROL_NO_VERIFICADO).catch(() => {});
          await targetMember.roles.add(ROL_CIUDADANO);
          await targetMember.setNickname(pending.usuarioRoblox);

          const confirmadoEmbed = new EmbedBuilder()
            .setColor(0x00c851)
            .setDescription(`<a:Aprobado:1399874076402778122> | El usuario <@${pending.targetUserId}> ha sido verificado exitosamente.\nSe le agregó el rol <@&${ROL_CIUDADANO}> y se eliminó el rol <@&${ROL_NO_VERIFICADO}>.`)
            .setTimestamp()
            .setFooter({ text: `Verificado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
          await interaction.editReply({ embeds: [confirmadoEmbed], components: [] });

          const bienvenidaEmbed = new EmbedBuilder()
            .setColor(0x00c851)
            .setTitle("<a:Aprobado:1399874076402778122> | ¡Bienvenido a Argentina Roleplay!")
            .setDescription(`<a:check1:1468762093741412553> | Bienvenido a Argentina RP, si eres nuevo te recomiendo leer <#1349870170734333956> <#1350162245187010731> <#1349870170734333957> Tambien recuerda que si tienes alguna duda ve a <#1350160761653170246> 👀`)
            .setThumbnail(pending.fullBodyUrl)
            .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" })
            .setTimestamp();

          const bienvenidaChannel = await client.channels.fetch(CANAL_BIENVENIDA);
          if (bienvenidaChannel instanceof TextChannel || bienvenidaChannel instanceof NewsChannel) {
            const saludarRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId(`saludar_${pending.targetUserId}`).setLabel("Saludar").setStyle(ButtonStyle.Success),
            );
            await bienvenidaChannel.send({ content: `<@${pending.targetUserId}>`, embeds: [bienvenidaEmbed], components: [saludarRow] });
          }
          try {
            const dmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setLabel("Reglas Roleplay").setStyle(ButtonStyle.Link).setURL("https://docs.google.com/document/d/19G2DCFIH32MWgfYgMVF7HjUf30Y0i-v4h-0QvYi3gm4/edit?tab=t.0"),
            );
            await targetMember.send({ embeds: [bienvenidaEmbed], components: [dmRow] });
          } catch {
            console.log(`No se pudo enviar DM de bienvenida a ${pending.targetUserId}.`);
          }
        } catch (error: any) {
          console.error("Error en verificar_si:", error);
          return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\``, embeds: [], components: [] });
        }
        return;
      }

      // Verificar — NO
      if (interaction.customId.startsWith("verificar_no_")) {
        const pendingKey = interaction.customId.replace("verificar_no_", "");
        const pending    = pendingVerifications.get(pendingKey);
        if (!pending) return interaction.update({ content: "La sesión de verificación expiró.", embeds: [], components: [] });
        if (interaction.user.id !== pending.moderatorId) return interaction.reply({ content: "Solo el moderador que ejecutó el comando puede cancelar la verificación.", ephemeral: true });
        pendingVerifications.delete(pendingKey);
        return interaction.update({ content: "Verificación cancelada. Revisá el usuario de Roblox e intentá nuevamente.", embeds: [], components: [] });
      }

      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SLASH COMMANDS
    // ══════════════════════════════════════════════════════════════════════
    if (!interaction.isChatInputCommand()) return;

    // ── /ayuda ────────────────────────────────────────────────────────────
    if (interaction.commandName === "ayuda") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("<:config:1473970137089445909> | Comandos — Argentina RP Bot")
        .setDescription("Lista completa de comandos disponibles.")
        .addFields(
          {
            name: "✅ Verificación",
            value: `\`/verificar\` — Verifica a un usuario en https://discord.com/channels/${GUILD_ID}/${CANAL_VERIFICAR} *(Solo Moderadores)*`,
            inline: false,
          },
          {
            name: "🎮 Roblox & RP",
            value: [
              `\`/roblox-info\` — Muestra información detallada de una cuenta de Roblox`,
              `\`/entorno\` — Registra el entorno de tu personaje en https://discord.com/channels/${GUILD_ID}/${CANAL_ENTORNO}`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "⭐ Staff",
            value: [
              `\`/calificar-staff\` — Calificá el desempeño de un moderador en https://discord.com/channels/${GUILD_ID}/${CANAL_CALIFICAR_STAFF}`,
              `\`/lista-staff\` — Ve la lista de moderadores y postulantes`,
              `\`/añadir-rol\` — Añade un rol a un usuario *(Solo Moderadores)*`,
              `\`/eliminar-rol\` — Elimina un rol de un usuario *(Solo Moderadores)*`,
              `\`/muted\` — Silencia a un usuario por un tiempo determinado *(Solo Moderadores)*`,
            ].join("\n"),
            inline: false,
          },
          {
            name: "ℹ️ Info",
            value: "`c?info` — Información general del bot",
            inline: false,
          },
        )
        .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC | Dev: @vladimirfernan.", iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /calificar-staff ──────────────────────────────────────────────────
    if (interaction.commandName === "calificar-staff") {
      if (interaction.channelId !== CANAL_CALIFICAR_STAFF) return interaction.reply({ content: `Este comando solo se puede usar en <#${CANAL_CALIFICAR_STAFF}>`, ephemeral: true });
      const staffUser = interaction.options.getUser("staff", true);
      const estrellas = interaction.options.getInteger("estrellas", true);
      const nota      = interaction.options.getString("opinion_personal", true);
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const staffMember = await guild.members.fetch(staffUser.id);
        if (!staffMember.roles.cache.has(ROL_MODERADOR)) return interaction.reply({ content: "El usuario mencionado no es Moderador. Por favor intentalo de nuevo.", ephemeral: true });
        await storage.createCalificacion({ staffUserId: staffUser.id, calificadorUserId: interaction.user.id, estrellas, nota });
        const totalCalificaciones = await storage.countCalificacionesByStaff(staffUser.id);
        const promedioEstrellas   = await storage.getPromedioEstrellasByStaff(staffUser.id);
        const embed = new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("<:chik:1473970031489454100> | Calificación Staff — Registrada")
          .setDescription("Gracias por tu calificación.")
          .addFields(
            { name: "<:Miembro:1473969750139994112> | Usuario",              value: `${interaction.user}`,                                                      inline: true  },
            { name: "<:Moderadores:1473981745689923728> | Staff calificado", value: `${staffUser}`,                                                             inline: true  },
            { name: "<a:Nerd:1357113815623536791> | Estrellas",              value: "⭐".repeat(estrellas),                                                     inline: true  },
            { name: "<a:dancergb:1357113390413123775> | Opinión personal",   value: nota,                                                                       inline: false },
            { name: "<a:Aprobado:1399874076402778122> | Estadísticas",       value: `${totalCalificaciones} calificaciones · Promedio: ${promedioEstrellas}/5`, inline: false },
          )
          .setFooter({ text: "© Todos los derechos reservados 2026, Argentina RP┊ER:LC" })
          .setTimestamp();
        const canalDestino = await client.channels.fetch(CANAL_DESTINO_CALIFICACIONES);
        if (canalDestino instanceof TextChannel || canalDestino instanceof NewsChannel) {
          await canalDestino.send({ content: `<@${staffUser.id}>`, embeds: [embed] });
        }
        return interaction.reply({ content: "<a:Aprobado:1399874076402778122> | Tu calificación ha sido enviada correctamente.", ephemeral: true });
      } catch (error: any) {
        return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true });
      }
    }

    // ── /añadir-rol ───────────────────────────────────────────────────────
    if (interaction.commandName === "añadir-rol") {
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR)) return interaction.reply({ content: "<a:Nerd:1357113815623536791> | No tenés los permisos necesarios para este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const rol        = interaction.options.getRole("rol", true);
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetUser.id);
        if (targetMember.roles.cache.has(rol.id)) return interaction.reply({ content: `<:adv:1468761911821602947> | El usuario ${targetUser} ya tiene el rol ${rol}.`, ephemeral: true });
        await targetMember.roles.add(rol.id);
        const embed = new EmbedBuilder().setColor(0x00c851).setTitle("Rol Añadido").setDescription(`<a:Aprobado:1399874076402778122> | El rol <@&${rol.id}> ha sido añadido a ${targetUser} exitosamente.`).setTimestamp().setFooter({ text: `Ejecutado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
        return interaction.reply({ embeds: [embed], allowedMentions: { roles: [] } });
      } catch (error: any) {
        return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true });
      }
    }

    // ── /eliminar-rol ─────────────────────────────────────────────────────
    if (interaction.commandName === "eliminar-rol") {
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR)) return interaction.reply({ content: "<a:Nerd:1357113815623536791> | No tenés los permisos necesarios para este comando.", ephemeral: true });
      const targetUser = interaction.options.getUser("usuario", true);
      const rol        = interaction.options.getRole("rol", true);
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetUser.id);
        if (!targetMember.roles.cache.has(rol.id)) return interaction.reply({ content: `<:adv:1468761911821602947> | El usuario ${targetUser} no tiene el rol ${rol}.`, ephemeral: true });
        await targetMember.roles.remove(rol.id);
        const embed = new EmbedBuilder().setColor(0xff6600).setTitle("Rol Eliminado").setDescription(`<a:Aprobado:1399874076402778122> | El rol <@&${rol.id}> ha sido eliminado del perfil de ${targetUser} exitosamente.`).setTimestamp().setFooter({ text: `Ejecutado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
        return interaction.reply({ embeds: [embed], allowedMentions: { roles: [] } });
      } catch (error: any) {
        return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true });
      }
    }

    // ── /muted ────────────────────────────────────────────────────────────
    if (interaction.commandName === "muted") {
      const member = interaction.member;
      if (!member || !("roles" in member) || !(member.roles as any).cache.has(ROL_MODERADOR_MUTE)) return interaction.reply({ content: "<:equiz:1468761969518706708> | No sos Moderador. No podés usar este comando.", ephemeral: true });
      const targetUser  = interaction.options.getUser("usuario", true);
      const tiempoTexto = interaction.options.getString("tiempo", true);
      const motivo      = interaction.options.getString("motivo", true);
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        const targetMember = await guild.members.fetch(targetUser.id);
        function parseTiempo(texto: string): number | null {
          const regex = /(\d+)\s*(segundo|segundos|minuto|minutos|hora|horas|día|días|dia|dias)/i;
          const match = texto.match(regex);
          if (!match) return null;
          const cantidad = parseInt(match[1]);
          const unidad   = match[2].toLowerCase();
          if (unidad.includes("segundo")) return cantidad * 1000;
          if (unidad.includes("minuto"))  return cantidad * 60 * 1000;
          if (unidad.includes("hora"))    return cantidad * 60 * 60 * 1000;
          if (unidad.includes("día") || unidad.includes("dia")) return cantidad * 24 * 60 * 60 * 1000;
          return null;
        }
        const duracionMs = parseTiempo(tiempoTexto);
        if (!duracionMs) return interaction.reply({ content: "<:equiz:1468761969518706708> | Formato de tiempo inválido. Usá: `1 hora`, `30 minutos`, `2 días`, etc.", ephemeral: true });
        await targetMember.timeout(duracionMs, `${motivo} — Por: ${interaction.user.tag}`);
        const embed = new EmbedBuilder().setColor(0xff6600).setTitle("Usuario Silenciado").setDescription(`${interaction.user} silenció a ${targetUser} por **${tiempoTexto}**.\n**Motivo:** ${motivo}`).setTimestamp().setFooter({ text: "Sistema de Moderación" });
        await interaction.reply({ embeds: [embed] });
        try {
          await targetUser.send({ embeds: [new EmbedBuilder().setColor(0xff6600).setTitle("Has sido silenciado").setDescription(`Fuiste silenciado en **${guild.name}** por **${tiempoTexto}**.\n\n**Motivo:** ${motivo}`).setFooter({ text: "Si creés que es un error, contactá al staff." }).setTimestamp()] });
        } catch { console.log(`No se pudo enviar DM a ${targetUser.username}.`); }
      } catch (error: any) {
        return interaction.reply({ content: `Error: \`${error?.message ?? String(error)}\``, ephemeral: true });
      }
    }

    // ── /lista-staff ──────────────────────────────────────────────────────
    if (interaction.commandName === "lista-staff") {
      try {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: "Error al obtener información del servidor.", ephemeral: true });
        await interaction.deferReply();
        await guild.members.fetch();
        const arr   = Array.from(guild.members.cache.filter((m) => m.roles.cache.has(ROL_MODERADOR)).values());
        const list  = arr.length > 0 ? arr.map((m, i) => `**${i + 1}.** <@${m.id}>`).join("\n") : "<a:cargando:1456888296381874207> | No hay moderadores registrados.";
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("<:Soporte:1467253761377304850> | Lista de Staff").addFields({ name: "<:Moderadores:1473981745689923728> | Moderadores", value: list, inline: false }).setFooter({ text: `Total: ${arr.length} moderadores` }).setTimestamp();
        const row   = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("lista_staff_postulantes").setLabel("⛑️ | Postulantes").setStyle(ButtonStyle.Danger));
        return interaction.editReply({ embeds: [embed], components: [row] });
      } catch (error: any) {
        return interaction.editReply({ content: "Error al cargar la lista." });
      }
    }

    // ── /verificar ────────────────────────────────────────────────────────
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
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`verificar_si_${pendingKey}`).setLabel("Si").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`verificar_no_${pendingKey}`).setLabel("No").setStyle(ButtonStyle.Danger),
        );
        return interaction.editReply({ embeds: [confirmEmbed], components: [row] });
      } catch (error: any) {
        return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` });
      }
    }

    // ── /entorno ──────────────────────────────────────────────────────────
    if (interaction.commandName === "entorno") {
      const lugar         = interaction.options.getString("lugar", true);
      const entornoDesc   = interaction.options.getString("entorno", true);
      const usuarioRoblox = interaction.options.getString("usuario_roblox", true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const roblox = await getRobloxData(usuarioRoblox);
        if (!roblox) return interaction.editReply({ content: `No se encontró el usuario de Roblox: **${usuarioRoblox}**.` });
        const entornoEmbed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setTitle("<a:dancergb:1357113390413123775> | Registro de Entorno")
          .setThumbnail(roblox.fullBodyUrl)
          .addFields(
            { name: "<:discord:1468196272199569410> | Usuario de Discord", value: `${interaction.user}`,                                                  inline: true  },
            { name: "<:roblox:1468196317514956905> | Usuario de Roblox",  value: `[${roblox.name}](https://www.roblox.com/users/${roblox.id}/profile)`, inline: true  },
            { name: "\u200B",                                              value: "\u200B",                                                               inline: false },
            { name: "<a:fijado:1468193352439824384> | Lugar",              value: lugar,                                                                  inline: true  },
            { name: "<a:cargando:1456888296381874207> | Entorno",          value: entornoDesc,                                                            inline: false },
          )
          .setFooter({ text: `Registrado por ${interaction.user.tag} · Argentina RP┊ER:LC`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();
        const entornoChannel = await client.channels.fetch(CANAL_ENTORNO);
        if (!(entornoChannel instanceof TextChannel) && !(entornoChannel instanceof NewsChannel)) return interaction.editReply({ content: "No se pudo acceder al canal de entorno. Contactá a un administrador." });
        await entornoChannel.send({ embeds: [entornoEmbed] });
        return interaction.editReply({ content: `<a:check1:1468762093741412553> | Tu entorno ha sido registrado exitosamente en <#${CANAL_ENTORNO}>.` });
      } catch (error: any) {
        return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` });
      }
    }

    // ── /roblox-info ──────────────────────────────────────────────────────
    if (interaction.commandName === "roblox-info") {
      const usuarioRoblox = interaction.options.getString("usuario_roblox", false);
      await interaction.deferReply();
      try {
        if (!usuarioRoblox) return interaction.editReply({ content: "Por favor indicá un nombre de usuario de Roblox en el campo `usuario_roblox`." });
        const robloxBasic = await getRobloxData(usuarioRoblox);
        if (!robloxBasic) return interaction.editReply({ content: `No se encontró el usuario de Roblox: **${usuarioRoblox}**.` });
        const info = await getRobloxUserInfo(robloxBasic.id);
        if (!info) return interaction.editReply({ content: `No se pudo obtener la información completa de **${usuarioRoblox}**.` });
        const descripcionTruncada = info.description.length > 300 ? info.description.substring(0, 297) + "..." : info.description;
        const embed = new EmbedBuilder()
          .setColor(0xe8082c)
          .setTitle(`<:config:1473970137089445909> | ${info.displayName} (@${info.name})`)
          .setURL(info.profileUrl)
          .setThumbnail(info.fullBodyUrl)
          .setDescription(descripcionTruncada)
          .addFields(
            { name: "<:chik:1473970031489454100> | ID",             value: String(info.id),                          inline: true  },
            { name: "<:config:1473970137089445909> | Creado el",    value: info.created,                             inline: true  },
            { name: "<:BAN:1350470431441682514> | Baneado",         value: info.isBanned ? "Sí" : "No",              inline: true  },
            { name: "\u200B",                                        value: "\u200B",                                 inline: false },
            { name: "<:Miembro:1473969750139994112> | Amigos",      value: String(info.friendCount),                 inline: true  },
            { name: "<a:check1:1468762093741412553> | Seguidores",  value: String(info.followerCount),               inline: true  },
            { name: "<a:cargando:1456888296381874207> | Siguiendo", value: String(info.followingCount),              inline: true  },
            { name: "<:enlaces:1468199583418155197> | Perfil",      value: `[Ver en Roblox](${info.profileUrl})`,    inline: false },
          )
          .setFooter({ text: `Consultado por ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (error: any) {
        return interaction.editReply({ content: `Error: \`${error?.message ?? String(error)}\`` });
      }
    }

  });

  client.login(DISCORD_TOKEN);
  return httpServer;
}
