const STUN_SERVER = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};
const SIGNAL_URL = "wss://ws.ifelse.io";

const roomIdEl = document.getElementById("roomId");
const joinBtn = document.getElementById("joinBtn");
const shareBtn = document.getElementById("shareBtn");
const localVideo = document.getElementById("localVideo");
const remoteContainer = document.getElementById("remoteContainer");

let ws;
let peerMap = new Map();
let localStream;
let roomId;

async function initLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;
  } catch (err) {
    alert("无法获取摄像头/麦克风：" + err.message);
  }
}

function connectSignal() {
  ws = new WebSocket(SIGNAL_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "join",
      room: roomId
    }));
  };
  ws.onmessage = async (e) => {
    const data = JSON.parse(e.data);
    switch (data.type) {
      case "newPeer":
        createPeer(data.id, true);
        break;
      case "offer":
        await handleOffer(data);
        break;
      case "answer":
        await handleAnswer(data);
        break;
      case "candidate":
        await addIceCandidate(data);
        break;
    }
  };
}

function createPeer(peerId, isOffer) {
  const peer = new RTCPeerConnection(STUN_SERVER);
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  peer.ontrack = (e) => {
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = e.streams[0];
    remoteContainer.appendChild(video);
  };
  peer.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "candidate",
        target: peerId,
        candidate: e.candidate,
        room: roomId
      }));
    }
  };
  peerMap.set(peerId, peer);
  if (isOffer) {
    peer.createOffer().then(sdp => {
      peer.setLocalDescription(sdp);
      ws.send(JSON.stringify({
        type: "offer",
        target: peerId,
        sdp: sdp,
        room: roomId
      }));
    });
  }
}

async function handleOffer(data) {
  const { target, sdp } = data;
  createPeer(target, false);
  const peer = peerMap.get(target);
  await peer.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  ws.send(JSON.stringify({
    type: "answer",
    target: target,
    sdp: answer,
    room: roomId
  }));
}

async function handleAnswer(data) {
  const { target, sdp } = data;
  const peer = peerMap.get(target);
  await peer.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function addIceCandidate(data) {
  const { target, candidate } = data;
  const peer = peerMap.get(target);
  await peer.addIceCandidate(new RTCIceCandidate(candidate));
}

async function startShareScreen() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    peerMap.forEach(peer => {
      const senders = peer.getSenders();
      const videoSender = senders.find(s => s.track.kind === "video");
      if(videoSender) videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
    });
  } catch (err) {
    alert("当前设备无法共享屏幕：" + err.message);
  }
}

joinBtn.onclick = async () => {
  roomId = roomIdEl.value.trim();
  if (!roomId) return alert("请输入会议号");
  await initLocalMedia();
  connectSignal();
  alert("已加入会议，等待其他参会人");
};
shareBtn.onclick = startShareScreen;
