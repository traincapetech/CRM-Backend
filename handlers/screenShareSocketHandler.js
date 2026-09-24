/**
 * Screen Share & Remote Control Socket Handler
 * - Ultra-Reliable Canvas Frame Relay
 * - Bidirectional Remote Control Actions (Mouse, Keyboard, Scroll)
 * - Desktop Agent & Browser Client Interoperability
 */

// Active streams registry: { [userId]: { userId, userName, branchName, role, socketId, isAgent, startedAt, lastFrame, lastActive } }
const activeScreenStreams = new Map();

function updateSupervisorWatchingStatus(io) {
  const supervisorsRoom = io.sockets.adapter.rooms.get("supervisors_room");
  const supervisorsCount = supervisorsRoom ? supervisorsRoom.size : 0;
  const isSupervisorWatching = supervisorsCount > 0;

  io.emit("supervisor_watching_status", {
    isSupervisorWatching,
    supervisorsCount,
  });

  return { isSupervisorWatching, supervisorsCount };
}

module.exports = function screenShareSocketHandler(io, socket) {
  // 1. Supervisor joins the monitoring room
  socket.on("join_screen_monitors", () => {
    socket.join("supervisors_room");
    socket.isSupervisor = true;
    console.log(`📺 [SCREEN MONITOR] Supervisor joined monitors room: ${socket.id}`);

    // Send current list of active streaming employees with their last frame immediately
    const streamsList = Array.from(activeScreenStreams.values());
    socket.emit("active_screen_streams_list", streamsList);

    // Broadcast updated supervisor count to all publishers
    updateSupervisorWatchingStatus(io);
  });

  // 1b. Supervisor leaves monitoring room
  socket.on("leave_screen_monitors", () => {
    socket.leave("supervisors_room");
    socket.isSupervisor = false;
    console.log(`📺 [SCREEN MONITOR] Supervisor left monitors room: ${socket.id}`);
    updateSupervisorWatchingStatus(io);
  });

  // 2. Employee registers as screen publisher (from Web or Desktop Agent)
  socket.on("register_screen_publisher", (employeeInfo) => {
    if (!employeeInfo || !employeeInfo.userId) return;

    const uId = employeeInfo.userId.toString();
    const userName = (employeeInfo.userName || "").toLowerCase();
    const role = employeeInfo.role || "";

    // Exclude Chihanhor Kasom and Branch Partners / Admins from screen streaming
    if (
      uId === "6a96ab2898f2272dbcbc1114" ||
      userName.includes("chihanhor") ||
      ["Admin", "Branch Partner", "Partner"].includes(role)
    ) {
      console.log(`🚫 [SCREEN STREAM] Blocked screen stream registration for: ${employeeInfo.userName} (${uId}, role: ${role})`);
      return;
    }

    const existing = activeScreenStreams.get(uId);

    const streamData = {
      userId: uId,
      userName: employeeInfo.userName || "Sales Representative",
      branchName: employeeInfo.branchName || "Ukhrul Branch",
      role: employeeInfo.role || "Sales",
      socketId: socket.id,
      isAgent: !!employeeInfo.isAgent, // true if running from Traincape Desktop Agent
      startedAt: existing?.startedAt || new Date().toISOString(),
      lastFrame: existing?.lastFrame || null,
      lastActive: Date.now(),
    };

    activeScreenStreams.set(uId, streamData);
    socket.userId = uId;
    socket.isPublisher = true;

    console.log(`📡 [SCREEN STREAM] Registered: ${streamData.userName} (${uId}) [Agent: ${streamData.isAgent}]`);
    io.to("supervisors_room").emit("screen_stream_started", streamData);

    // Send current supervisor status directly to newly registered publisher
    const supervisorsRoom = io.sockets.adapter.rooms.get("supervisors_room");
    const supervisorsCount = supervisorsRoom ? supervisorsRoom.size : 0;
    socket.emit("supervisor_watching_status", {
      isSupervisorWatching: supervisorsCount > 0,
      supervisorsCount,
    });
  });

  // 3. Employee sends a compressed frame (JPEG/WebP dataUrl or buffer)
  socket.on("screen_frame", (data) => {
    if (!data || !data.userId || !data.frame) return;

    const uId = data.userId.toString();
    const stream = activeScreenStreams.get(uId);
    if (stream) {
      stream.lastFrame = data.frame;
      stream.lastActive = Date.now();
    }

    // Relay the frame instantly ONLY if supervisors are actually connected in the room
    const supervisorsRoom = io.sockets.adapter.rooms.get("supervisors_room");
    if (supervisorsRoom && supervisorsRoom.size > 0) {
      io.to("supervisors_room").emit("screen_frame", {
        userId: uId,
        frame: data.frame,
        timestamp: data.timestamp || Date.now(),
      });
    }
  });

  // 4. Supervisor executes a Remote Control Action (Mouse Click / Move / Keyboard)
  socket.on("remote_control_action", (actionData) => {
    if (!actionData || !actionData.targetUserId) return;

    const targetId = actionData.targetUserId.toString();
    const targetStream = activeScreenStreams.get(targetId);

    if (targetStream && targetStream.socketId) {
      // Send directly to the employee's agent socket
      io.to(targetStream.socketId).emit("execute_remote_action", {
        ...actionData,
        supervisorId: socket.userId || "supervisor",
        timestamp: Date.now(),
      });
    }
  });

  // 5. Backward compatibility for chunk if sent
  socket.on("screen_chunk", (data) => {
    if (!data || !data.userId) return;
    io.to("supervisors_room").emit("screen_chunk", data);
  });

  // 6. Employee stops sharing screen
  socket.on("stop_screen_publisher", (userId) => {
    const id = (userId || socket.userId)?.toString();
    if (id && activeScreenStreams.has(id)) {
      activeScreenStreams.delete(id);
      console.log(`🛑 [SCREEN STREAM] Stopped: ${id}`);
      io.to("supervisors_room").emit("screen_stream_stopped", { userId: id });
    }
  });

  // 7. Handle Disconnect
  socket.on("disconnect", () => {
    if (socket.isSupervisor) {
      setTimeout(() => {
        updateSupervisorWatchingStatus(io);
      }, 500);
    }
    if (socket.isPublisher && socket.userId) {
      const uId = socket.userId.toString();
      setTimeout(() => {
        const currentStream = activeScreenStreams.get(uId);
        if (currentStream && currentStream.socketId === socket.id) {
          activeScreenStreams.delete(uId);
          console.log(`🔌 [SCREEN STREAM] Publisher disconnected: ${uId}`);
          io.to("supervisors_room").emit("screen_stream_stopped", { userId: uId });
        }
      }, 3000);
    }
  });
};
