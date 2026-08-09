var express = require('express');
var passport = require('passport');
var User = require('../models/user');
var router = express.Router();
var Game = require("../models/game").game;
var Player = require("../models/player").player;
var _ = require('lodash');
var g = undefined;
//var namep1 = undefined;

// ============================================================================
/* GET home page. */
router.get('/', function (req, res) {
	res.render('index', { user : req.user });
});

//https://scotch.io/tutorials/using-mongoosejs-in-node-js-and-mongodb-applications

// ============================================================================
// ROUTER GET / POST REGISTER, IT'S WORKING.
router.get('/register', function(req, res) {
	res.render('register', {});
});

router.post('/register', function(req, res) {
	User.register(new User({ username: req.body.username }), req.body.password, function(err, user) {
		if (err) {
			return res.render("register", { info: "Usuario ya registrado o contraseña inválida."});
		}
		req.login(user, function(err) {
			if (err) {
				return res.render("register", { info: 'Usuario o clave incorrecto.' });
			}
			return res.redirect('/lobby');
		});
	});
});

// ===================================================================================================================
// ROUTER GET / POST LOGIN, IT'S WORKING.

router.get('/login', function(req, res) {
	res.render('login', {});
});

router.post('/login', function(req, res) {   
	User.authenticate()(req.body.username, req.body.password, function(err, user, info) {
		if (err || !user) {
			return res.render("login", { message: 'Usuario o contraseña incorrectos.' });
		}
		req.login(user, function(err) {			
			return res.redirect('/lobby');
		});			
	});
});

// ===================================================================================================================
// ROUTER GET / POST MYACC, WORKING.
router.get('/lobby', function(req, res){
	//console.log(user);
	res.render('lobby', {});
});

router.post('/lobby'), function(req,res) {
	res.render('lobby', {});
}

// ===================================================================================================================
// ROUTER GET / POST MYACC, WORKING.
router.get('/myacc', function(req, res){
	res.render('myacc', {user: req.user});
});

router.post('/myacc'), function(req,res) {
	res.render('myacc', { user: req.user} );
}

// ===================================================================================================================
// ROUTER GET / POST , WORKING.
router.get('/win', function(req, res){
	res.render('win', { g : g , user: req.user });
});

router.post('/win'), function(req,res) {
	res.render('win');
}

// ===================================================================================================================
// ROUTER GET LOGOUT / WORKING 
router.get('/logout', function(req, res) {
	req.logout();
	res.redirect('/');
});

// ===================================================================================================================
// ROUTER GET / POST NEW GAME , IT'S WORKING. :)))))))
router.get('/newgame', function(req,res){  
	User.findOne({username: req.body.username},function(err,user) {	
		if (!err && user) { console.log(user.username); }
	});
	var p1 = new Player(req.user.username);
	var p2 = new Player("Invitado");
	g = new Game(p1, p2);
	g.currentHand = 'player1';
	res.redirect('/play');
	/*	
		var user = new User({username: req.body.username, 
						password: req.body.password
					});	

		user: {
			type: Schema.ObjectId,
			ref: 'Player'
		},
  		nickname: {
		    type: String,
		    required: true,
		    unique: true
  		},
  		cards: Array,
  		envidoPoints: {
			type: Number,
			default: 0,
		});*/	
	//var p2 = new Player("Invitado");
	//g = new Game(p1,p2);           
	//res.redirect('/play');
	//res.send("Hola");
});


// ===================================================================================================================

var ACTION_META = {
	playcard:  { label: 'Jugar carta',    desc: 'Tirá una carta a la mesa tocando la carta que quieras.' },
	envido:    { label: 'Envido',   desc: 'Cantá el envido: se comparan puntos de tus cartas (vale 2).' },
	truco:     { label: 'Truco',       desc: 'Subí la apuesta de la jugada (vale 2). Puede anidar: retruco (4), vale cuatro (6).' },
	quiero:    { label: 'Quiero',       desc: 'Aceptás el envido o el truco que te cantaron.' },
	'no-quiero': { label: 'No quiero',  desc: 'Rechazás el envite: el rival suma esos puntos.' },
	mazo:      { label: 'Ir al mazo',   desc: 'Tirás la jugada y le das el truco al rival.' }
};

function playContext(res, g){
	var turn   = g.currentRound.currentTurn;
	var isP1   = turn === 'player1';
	var allowed = g.currentRound.allowedActions();
	var state   = g.currentRound.fsm.current;
	var pendingEnvite = state === 'truco' || state === 'envido';

	var actions = _.filter(allowed, function(a){ return ACTION_META[a] && a !== 'playcard'; })
		.map(function(a){
			return { key: a, label: ACTION_META[a].label, desc: ACTION_META[a].desc };
		});

	res.render('play', {
		g : g,
		statusMsg   : g.currentRound.statusMessage(),
		allowed     : allowed,
		actions     : actions,
		canPlayCard : !pendingEnvite && allowed.indexOf('playcard') >= 0,
		isP1Turn    : isP1,
		currentPlayerName : isP1 ? g.player1.name : g.player2.name,
		otherPlayerName   : isP1 ? g.player2.name : g.player1.name,
		currentHand : isP1 ? g.player1.cards : g.player2.cards,
		otherHand   : isP1 ? g.player2.cards : g.player1.cards,
		currentTable : isP1 ? g.currentRound.tablep1 : g.currentRound.tablep2,
		otherTable   : isP1 ? g.currentRound.tablep2 : g.currentRound.tablep1
	});
}

router.get('/play', function(req, res){
	if (!g || !g.currentRound || g.currentRound.auxWin) {
		g.newRound();
		g.currentRound.deal();
	}
	playContext(res, g);
});

router.post('/play', function(req, res){
	try {
		if(g.currentRound.fsm.cannot(req.body.action)){
			return res.redirect('notmove');  
		}
		if(req.body.value == '' && req.body.action == 'playcard'){
			return res.redirect('notmove'); 
		}
		g.play(g.currentRound.currentTurn, req.body.action, req.body.value);
		if(g.score[0] >= 30){
			return res.redirect('win');
		}
		else if(g.score[1] >= 30){
		   return res.redirect('win'); 
		}else{
			if(g.currentRound.auxWin == true){
				g.newRound();
				g.currentRound.deal();
			}
			return playContext(res, g);
		}
	} catch(e) {
		return res.redirect('notmove');
	}
});

router.get('/meme', function(req, res) {
	res.render('meme');
});

router.get('/notmove', function(req, res) {
	res.render('notmove');
});

module.exports = router;
// ===================================================================================================================
/*
router.get('/ping', function(req, res){
	res.status(200).send("pong!");
});
*/

/*
router.post('/login', passport.authenticate('local'), function(req, res) {
	res.redirect('/');
});
*/
/*
router.post("/sessions", function(req,res){
	User.findOne({email: req.body.email ,password:req.body.password},function(err,user){
		req.session.user_id = user._id;
		res.redirect("/");
		// _id , asignacion de mongo unica para la base de datos.       
	});
});*/

/*
router.post('/login', 
	passport.authenticate('local', 
	{successRedirect : '/',
	successFlash: 'Welcome!',     
	failureRedirect: '/login', 
	failureFlash: true 
}));*/

/*
app.post('/login', passport.authenticate('local', { successRedirect: '/',
													failureRedirect: '/login' }));

router.post('/login', function(req,res){
	if (err) {
		return res.render('login', { user : user });
	}
	passport.authenticate('local')(req, res, function () {
		res.redirect('/register');
	});
});
*/






