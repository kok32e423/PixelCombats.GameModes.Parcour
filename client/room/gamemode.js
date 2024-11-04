//var System = importNamespace('System');
import * as basic from 'pixel_combats/basic';
import * as room from 'pixel_combats/room';
import * as teams from './default_teams.js';

// опции
const END_OF_MATCH_TIME = 10;
const VOTE_TIME = 20;

// константы
const GameStateValue = "Game";
const EndOfMatchStateValue = "EndOfMatch";
const EndAreaTag = "parcourend";         // тэг зоны конца паркура
const SpawnAreasTag = "spawn";        // тэг зон промежуточных спавнов
const EndTriggerPoints = 1000;        // сколько дается очков за завершение маршрута
const CurSpawnPropName = "CurSpawn"; // свойство, отвечающее за индекс текущего спавна 0 - дефолтный спавн
const ViewSpawnsParameterName = "ViewSpawns";        // параметр создания комнаты, отвечающий за визуализацию спавнов
const ViewEndParameterName = "ViewEnd";        // параметр создания комнаты, отвечающий за визуализацию конца маршрута
const MaxSpawnsByArea = 25;        // макс спавнов на зону
const LeaderBoardProp = "Leader"; // свойство для лидерборда

// постоянные переменные
const mainTimer = room.Timers.GetContext().Get("Main");                 // таймер конца игры
var endAreas = room.AreaService.GetByTag(EndAreaTag);                // зоны конца игры
var spawnAreas = room.AreaService.GetByTag(SpawnAreasTag);        // зоны спавнов
const stateProp = room.Properties.GetContext().Get("State");        // свойство состояния
const inventory = room.Inventory.GetContext();                                // контекст инвентаря
const gameEndAreaColor = new basic.Color(0, 0, 1, 0);        // цвет зоны конца маршрута
const areaColor = new basic.Color(1, 1, 1, 0);        // цвет зоны

// параметры режима
const MAP_ROTATION = room.GameMode.Parameters.GetBool("MapRotation");
room.Properties.GetContext().GameModeName.Value = "GameModes/Parcour";
room.Damage.FriendlyFire = false;
//room.Map.Rotation = MAP_ROTATION;
room.BreackGraph.OnlyPlayerBlocksDmg = room.GameMode.Parameters.GetBool("PartialDesruction");
room.BreackGraph.WeakBlocks = room.GameMode.Parameters.GetBool("LoosenBlocks");

// запрещаем все в руках
inventory.Main.Value = false;
inventory.Secondary.Value = false;
inventory.Melee.Value = false;
inventory.Explosive.Value = false;
inventory.Build.Value = false;

// создаем команду
const blueTeam = teams.create_team_blue();
blueTeam.Spawns.RespawnTime.Value = 0;

// настройка голосования
function OnVoteResult(v) {
        if (v.Result === null) return;
        room.NewGame.RestartGame(v.Result);
}
room.NewGameVote.OnResult.Add(OnVoteResult); // вынесено из функции, которая выполняется только на сервере, чтобы не зависало, если не отработает, также чтобы не давало баг, если вызван метод 2 раза и появилось 2 подписки

function start_vote() {
        room.NewGameVote.Start({
                Variants: [{ MapId: 0 }],
                Timer: VOTE_TIME
        }, MAP_ROTATION ? 3 : 0);
}

// вывод подсказки
room.Ui.GetContext().Hint.Value = "Hint/GoParcour";

// настраиваем игровые состояния
stateProp.OnValue.Add(OnState);
function OnState() {
        const spawnsRoomContext = room.Spawns.GetContext();
        switch (stateProp.Value) {
                case GameStateValue:
                        spawnsRoomContext.enable = true;
                        break;
                case EndOfMatchStateValue:
                        // деспавн
                        spawnsRoomContext.enable = false;
                        spawnsRoomContext.Despawn();
                        room.Game.GameOver(room.LeaderBoard.GetPlayers());
                        mainTimer.Restart(END_OF_MATCH_TIME);
                        room.Ui.GetContext().MainTimerId.Value = mainTimer.Id;
                        // говорим кто победил
                        break;
        }
}

// визуализируем конец маршрута
if (room.GameMode.Parameters.GetBool(ViewEndParameterName)) {
        var endView = room.AreaViewService.GetContext().Get("EndView");
        endView.Color = gameEndAreaColor;
        endView.Tags = [EndAreaTag];
        endView.Enable = true;
}

// визуализируем промежуточные спавны маршрута
if (room.GameMode.Parameters.GetBool(ViewSpawnsParameterName)) {
        var spawnsView = room.AreaViewService.GetContext().Get("SpawnsView");
        spawnsView.Color = areaColor;
        spawnsView.Tags = [SpawnAreasTag];
        spawnsView.Enable = true;
}

// настраиваем триггер конца игры
const endTrigger = room.AreaPlayerTriggerService.Get("EndTrigger");
endTrigger.Tags = [EndAreaTag];
endTrigger.Enable = true;
endTrigger.OnEnter.Add(function (player) {
        endTrigger.Enable = false;
        player.Properties.Get(LeaderBoardProp).Value += EndTriggerPoints;
        stateProp.Value = EndOfMatchStateValue;
});

// настраиваем триггер спавнов
const spawnTrigger = room.AreaPlayerTriggerService.Get("SpawnTrigger");
spawnTrigger.Tags = [SpawnAreasTag];
spawnTrigger.Enable = true;
spawnTrigger.OnEnter.Add(function (player, area) {
        if (spawnAreas == null || spawnAreas.length == 0) InitializeMap(); // todo костыль изза бага (не всегда прогружает нормально)        
        if (spawnAreas == null || spawnAreas.length == 0) return;
        const curSpawn = player.Properties.Get(CurSpawnPropName);
        const leaderBoardProp = player.Properties.Get(LeaderBoardProp);
        var i = 0;
        if (curSpawn.Value != null) i = curSpawn.Value;
        for (; i < spawnAreas.length; ++i) {
                if (spawnAreas[i] == area) {
                        if (curSpawn.Value == null || i > curSpawn.Value) {
                                curSpawn.Value = i;
                                leaderBoardProp.Value += 1;
                        }
                        break;
                }
        }
});

// настраиваем таймер конца игры
mainTimer.OnTimer.Add(function () { start_vote(); });

// создаем лидерборд
room.LeaderBoard.PlayerLeaderBoardValues = [
        {
                Value: "Deaths",
                DisplayName: "Statistics/Deaths",
                ShortDisplayName: "Statistics/DeathsShort"
        },
        {
                Value: LeaderBoardProp,
                DisplayName: "Statistics/Scores",
                ShortDisplayName: "Statistics/ScoresShort"
        }
];
// сортировка команд
room.LeaderBoard.TeamLeaderBoardValue = {
        Value: LeaderBoardProp,
        DisplayName: "Statistics/Scores",
        ShortDisplayName: "Statistics/Scores"
};
// сортировка игроков
room.LeaderBoard.PlayersWeightGetter.Set(function (player) {
        return player.Properties.Get(LeaderBoardProp).Value;
});
// счетчик смертей
room.Damage.OnDeath.Add(function (player) {
        ++player.Properties.Deaths.Value;
});

// разрешаем вход в команду
room.Teams.OnRequestJoinTeam.Add(function (player, team) { team.Add(player); });
// разрешаем спавн
room.Teams.OnPlayerChangeTeam.Add(function (player) { player.Spawns.Spawn() });

// счетчик спавнов
room.Spawns.OnSpawn.Add(function (player) {
        ++player.Properties.Spawns.Value;
});

// инициализация всего что зависит от карты
room.Map.OnLoad.Add(InitializeMap);
function InitializeMap() {
        endAreas = room.AreaService.GetByTag(EndAreaTag);
        spawnAreas = room.AreaService.GetByTag(SpawnAreasTag);
        //log.debug("spawnAreas.length=" + spawnAreas.length);
        // ограничитель
        if (spawnAreas == null || spawnAreas.length == 0) return;
        // сортировка зон
        spawnAreas.sort(function (a, b) {
                if (a.Name > b.Name) return 1;
                if (a.Name < b.Name) return -1;
                return 0;
        });
}
InitializeMap();

// при смене свойства индекса спавна задаем спавн
room.Properties.OnPlayerProperty.Add(function (context, prop) {
        if (prop.Name != CurSpawnPropName) return;
        //log.debug(context.Player + " spawn point is " + prop.Value);
        SetPlayerSpawn(context.Player, prop.Value);
});

function SetPlayerSpawn(player, index) {
        const spawns = room.Spawns.GetContext(player);
        // очистка спавнов
        spawns.CustomSpawnPoints.Clear();
        // если нет захвата то сброс спавнов
        if (index < 0 || index >= spawnAreas.length) return;
        // определяем куда смотреть спавнам
        var lookPoint = {};
        if (index < spawnAreas.length - 1) lookPoint = spawnAreas[index + 1].Ranges.GetAveragePosition();
        else {
                if (endAreas.length > 0)
                        lookPoint = endAreas[0].Ranges.GetAveragePosition();
        }

        //log.debug("range=" + range);
        var spawnsCount = 0;
        const coordinates = player.Position;
        	
        spawns.CustomSpawnPoints.Add(coordinates.x, coordinates.y, coordinates.z, room.Spawns.GetSpawnRotation(coordinates.x, coordinates.z, lookPoint.x, lookPoint.z));
        ++spawnsCount;
        if (spawnsCount > MaxSpawnsByArea) return;
}

// запуск игры
stateProp.Value = GameStateValue;