const express = require('express')
const http = require("http")
const {Server} = require("socket.io")

const app = express()
const server = http.createServer(app)
const webserver = new Server(server,{cors: {
    origin: "*",
    methods: ["GET", "POST"],
}})

const port = process.env.PORT || 3000
const {RoomPool} = require('./api/Room')
const Rooms = new RoomPool()

app.use(express.static('public'))
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html')
})

/*Gestione utente*/
webserver.on("connection",(socket) => {

    webserver.to(socket.id).emit("connected",socket.id)
    console.log("User : " + socket.id + " connected")
    
    socket.on("createRoom",(data) => {
        try
        {
            const room = Rooms.Create(data.name,socket.id)
            socket.join(room.id)
            console.log("Room : " + room.id + " created")
            webserver.to(socket.id).emit("roomCreated",{roomId : room.id, user : room.admin.toJSON()})
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("joinRoom",(data) => {
        try
        {
            const room = Rooms.FindRoom(data.roomId)
            if(!room)
            {
                webserver.to(socket.id).emit("roomNotExist", "Not exist")
                return
            }
            const user = room.Add(data.name,socket.id)
            if(!user)
            {
                webserver.to(socket.id).emit("alreadyRound", "Not now")
                return
            }
            webserver.to(room.id).emit('playerJoined')
            socket.join(room.id)
            console.log("Room : " + room.id + " joined " + socket.id)
            webserver.to(socket.id).emit('joinedRoom', {user : user.toJSON(), roomId : room.id})
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("startRound", () => {
        try
        {
            const room = Rooms.FindRoomByUser(socket.id)
            if(!room)
            {
                webserver.to(socket.id).emit("error", "Not exist")
                return
            }
            if(room.Asker.unicid != socket.id)
            {
                webserver.to(socket.id).emit("error", "No you idiot")
                return
            }
            const resp = room.StartRound()
            if(resp == false)
            {
                webserver.to(socket.id).emit("downUsers", "Not now")
                return
            }
            else if(resp == null)
            {
                const result = room.ResultGame()
                webserver.to(room.id).emit('gameEnded', {result : result.map((u) => u.toJSON())})
                Rooms.Destroy(room.id)
                console.log("Room : " + room.id + " destroyed")
            }
            webserver.to(room.id).emit('questionRe', {question : room.CurrentRound.question.toJSON()})
            console.log("Room : " + room.id + " round started")
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("infoRoom",(data) => {
        try
        {
            const room = Rooms.FindRoom(data.roomId)
            if(!room)
            {
                webserver.to(socket.id).emit("error", "Not exist")
                return
            }
            webserver.to(socket.id).emit('infoRoomed', {room : room.infoJSON()})
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("getAnswers",(data) => {
        try
        {
            const room = Rooms.FindRoom(data.roomId)
            if(!room)
            {
                webserver.to(socket.id).emit("error", "Not exist")
                return
            }
            const result = room.GetAnswers()
            if(!result)
            {
                webserver.to(socket.id).emit("error", "Not now")
                return
            }
            webserver.to(socket.id).emit('gettedAnswers', {answers : result.map((resu) => [
                resu[0].toJSON(),
                resu[1].map((card) => card.toJSON())
            ])})
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("endRound",(data) => {
        try
        {
            const room = Rooms.FindRoom(data.roomId)
            if(!room)
            {
                webserver.to(socket.id).emit("error", "Not exist")
                return
            }
            if(room.Asker.unicid != socket.id)
            {
                webserver.to(socket.id).emit("error", "No you idiot")
                return
            }
            room.EndRound(data.id)
            webserver.to(room.id).emit('whoWon', {winner : room.Asker.toJSON(), lastwinner : room.LastAsker.toJSON()})
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("receiveAnswer",(data) => {
        try
        {
            const room = Rooms.FindRoom(data.roomId)
            if(!room)
            {
                webserver.to(socket.id).emit("error", "Not exist")
                return
            }
            room.ReceiveAnswer(socket.id,data.indexcards)
            const user = room.FindUser(socket.id)
            webserver.to(socket.id).emit('receivedAnswer', {user : user.toJSON()})
        }
        catch(error)
        {
            console.log(error)
        }
    })

    socket.on("endGame", () => {
        const room = Rooms.FindRoom(data.roomId)
        if(!room)
        {
            webserver.to(socket.id).emit("error", "Not exist")
            return
        }
        if(room.admin.unicid != socket.id)
        {
            webserver.to(socket.id).emit("error", "No you idiot")
            return
        }
        const result = room.ResultGame()
        webserver.to(room.id).emit('gameEnded', {result : result.map((u) => u.toJSON())})
        Rooms.Destroy(room.id)
        console.log("Room : " + room.id + " destroyed")
    })

    socket.on("disconnect",() => {
        try
        {
            console.log("User : " + socket.id + " disconnected")
            const room = Rooms.FindRoomByUser(socket.id)
            if(room) 
            {
                webserver.to(room.id).emit('playerLeft')
                if (room.Asker.unicid == socket.id || room.admin.unicid == socket.id) 
                {
                    webserver.to(room.id).emit('roomClosed')
                    Rooms.Destroy(room.id)
                    console.log("Room : " + room.id + " destroyed")
                    return
                }
                room.DestroyUser(socket.id)
            }
        }
        catch(error)
        {
            console.log(error)
        }
    })

})

server.listen(port, () => {
    console.log("Server : http://localhost:" + port)
})