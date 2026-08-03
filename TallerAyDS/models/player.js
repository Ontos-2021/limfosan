/*
 * Represents a player in the game
 * @param name [String]: old state to intialize the new state
 */
var _ = require('lodash');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/*
 * Player Schema
 */

var PlayerSchema = new Schema({
  pl: {
    type: Schema.ObjectId,
    ref: 'Player'
  },
  username: {
    type: String,
    //required: true,
    //unique: true
  },
  cards: Array,
  envidoPoints: {
    type: Number,
    default: 0,
  }
});

var PlayerModel = mongoose.model('Player', PlayerSchema);

function Player(name) {
  /*
   * the player's name
   */
  this.name = name;

  /*
   * cards of this user
   */
  this.cards = [];

  /*
   * user envido points
   */
  this.envidoPoints = 0;
  
}

/*
 * Add cards to user and calculate the user points
 */
Player.prototype.setCards = function(cards){
  this.cards = cards;
  this.envidoPoints = this.points();
  //console.log("Puntos del envido:" + this.envidoPoints)
}

/*
 * Returns the user envido points
 */
Player.prototype.points = function(){
  var pairs = [
    [this.cards[0], this.cards[1]],
    [this.cards[0], this.cards[2]],
    [this.cards[1], this.cards[2]],
  ];

  var pairValues = _.map(pairs, function(pair){
    return pair[0].envido(pair[1]);
  });

  return _.max(pairValues);
};

//module.exports = mongoose.model('Player', PlayerSchema);

module.exports.player = Player;
