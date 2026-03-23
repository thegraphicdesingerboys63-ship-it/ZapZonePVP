// ════════════════════════════════════════════════════════════════
// Voice Chat — WebRTC Peer-to-Peer
// ════════════════════════════════════════════════════════════════

const VoiceChat = (() => {
  let localStream = null;
  let peers = {};
  let isMuted = false;
  let isInitialized = false;

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  async function init() {
    if (isInitialized) return;
    if (!GameState.settings.voiceEnabled) return;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      isInitialized = true;
      console.log('[Voice] Microphone initialized');

      // Connect to all players in room
      connectToRoomPlayers();
    } catch(e) {
      console.warn('[Voice] Mic access denied:', e.message);
      isInitialized = false;
    }
  }

  function connectToRoomPlayers() {
    const remote = PlayerController.remotePlayers;
    Object.keys(remote).forEach(id => {
      if (!peers[id]) createPeer(id, true);
    });
  }

  function createPeer(targetId, isInitiator) {
    if (peers[targetId]) return peers[targetId];
    const pc = new RTCPeerConnection(RTC_CONFIG);

    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      let audio = document.getElementById(`voice_${targetId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `voice_${targetId}`;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
      audio.srcObject = stream;

      // Show voice indicator
      showVoiceIndicator(targetId, true);
      stream.getAudioTracks()[0].onended = () => {
        showVoiceIndicator(targetId, false);
      };
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        Network.sendVoiceICE(targetId, e.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(targetId);
      }
    };

    peers[targetId] = pc;

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        Network.sendVoiceOffer(targetId, offer);
      }).catch(e => console.warn('[Voice] Offer failed:', e));
    }

    return pc;
  }

  async function handleOffer(from, offer) {
    const pc = createPeer(from, false);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      Network.sendVoiceAnswer(from, answer);
    } catch(e) { console.warn('[Voice] Handle offer failed:', e); }
  }

  async function handleAnswer(from, answer) {
    const pc = peers[from];
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch(e) { console.warn('[Voice] Handle answer failed:', e); }
  }

  async function handleICE(from, candidate) {
    const pc = peers[from];
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch(e) { console.warn('[Voice] ICE failed:', e); }
  }

  function removePeer(id) {
    if (peers[id]) { peers[id].close(); delete peers[id]; }
    const audio = document.getElementById(`voice_${id}`);
    if (audio) audio.remove();
    showVoiceIndicator(id, false);
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    }
    Network.sendVoiceMute(isMuted);
    updateMuteButton();
    return isMuted;
  }

  function setMuted(muted) {
    isMuted = muted;
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !muted);
    }
    updateMuteButton();
  }

  function setPlayerMuted(playerId, muted) {
    const audio = document.getElementById(`voice_${playerId}`);
    if (audio) audio.muted = muted;
    showVoiceIndicator(playerId, !muted);
  }

  function updateMuteButton() {
    // Update mute button in HUD if exists
    const btn = document.getElementById('voice-mute-btn');
    if (btn) btn.textContent = isMuted ? '🔇' : '🎤';
  }

  function showVoiceIndicator(playerId, speaking) {
    const container = document.getElementById('voice-indicators');
    if (!container) return;
    let ind = document.getElementById(`vi_${playerId}`);
    const rp = PlayerController.remotePlayers[playerId];
    if (!rp) return;

    if (speaking) {
      if (!ind) {
        ind = document.createElement('div');
        ind.id = `vi_${playerId}`;
        ind.className = 'voice-indicator';
        ind.innerHTML = `🎤 ${rp.username}`;
        container.appendChild(ind);
      }
      ind.classList.add('active');
    } else {
      if (ind) ind.classList.remove('active');
    }
  }

  function cleanup() {
    Object.keys(peers).forEach(removePeer);
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    isInitialized = false;
  }

  return {
    init, cleanup, toggleMute, setMuted, setPlayerMuted,
    handleOffer, handleAnswer, handleICE,
    get isMuted() { return isMuted; }
  };
})();
