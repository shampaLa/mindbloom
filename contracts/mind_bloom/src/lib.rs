#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env, String};

const DAY_IN_SECONDS: u64 = 86_400;
const WEEK_IN_SECONDS: u64 = 604_800;

pub const MIN_SESSION_MINUTES: u32 = 5;
pub const MAX_SESSION_MINUTES: u32 = 480;
pub const MIN_GOAL_MINUTES: u32 = 30;
pub const MAX_GOAL_MINUTES: u32 = 5_000;

#[derive(Clone)]
#[contracttype]
pub struct WellnessProfile {
    pub display_name: String,
    pub created_at: u64,
    pub last_mindful_day: u64,
    pub active_week: u64,
    pub weekly_goal_minutes: u32,
    pub total_minutes: u32,
    pub minutes_this_week: u32,
    pub session_count: u32,
    pub current_streak: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct MindfulnessSession {
    pub practice_type: String,
    pub minutes_spent: u32,
    pub timestamp: u64,
    pub streak_after_log: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct WellnessDashboard {
    pub display_name: String,
    pub weekly_goal_minutes: u32,
    pub total_minutes: u32,
    pub minutes_this_week: u32,
    pub session_count: u32,
    pub current_streak: u32,
    pub created_at: u64,
    pub goal_reached_this_week: bool,
}

#[contractevent]
#[derive(Clone)]
pub struct ProfileSaved {
    #[topic]
    pub mindful_user: Address,
    pub display_name: String,
    pub weekly_goal_minutes: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct WeeklyGoalUpdated {
    #[topic]
    pub mindful_user: Address,
    pub weekly_goal_minutes: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct SessionLogged {
    #[topic]
    pub mindful_user: Address,
    pub practice_type: String,
    pub minutes_spent: u32,
    pub minutes_this_week: u32,
    pub current_streak: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct WeeklyGoalReached {
    #[topic]
    pub mindful_user: Address,
    pub weekly_goal_minutes: u32,
    pub minutes_this_week: u32,
    pub current_streak: u32,
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Profile(Address),
    Session(Address, u32),
}

#[contract]
pub struct MindBloom;

#[contractimpl]
impl MindBloom {
    pub fn save_profile(
        env: Env,
        mindful_user: Address,
        display_name: String,
        weekly_goal_minutes: u32,
    ) {
        mindful_user.require_auth();
        validate_display_name(&display_name);
        validate_weekly_goal(weekly_goal_minutes);

        let now = env.ledger().timestamp();
        let current_week = current_week(&env);

        let mut profile = read_profile_optional(&env, &mindful_user).unwrap_or(WellnessProfile {
            display_name: display_name.clone(),
            created_at: now,
            last_mindful_day: 0,
            active_week: current_week,
            weekly_goal_minutes,
            total_minutes: 0,
            minutes_this_week: 0,
            session_count: 0,
            current_streak: 0,
        });

        sync_week(&mut profile, current_week);
        profile.display_name = display_name.clone();
        profile.weekly_goal_minutes = weekly_goal_minutes;

        write_profile(&env, &mindful_user, &profile);
        ProfileSaved {
            mindful_user,
            display_name,
            weekly_goal_minutes,
        }
        .publish(&env);
    }

    pub fn update_weekly_goal(env: Env, mindful_user: Address, new_goal_minutes: u32) {
        mindful_user.require_auth();
        validate_weekly_goal(new_goal_minutes);

        let mut profile = read_profile_required(&env, &mindful_user);
        sync_week(&mut profile, current_week(&env));
        profile.weekly_goal_minutes = new_goal_minutes;

        write_profile(&env, &mindful_user, &profile);
        WeeklyGoalUpdated {
            mindful_user,
            weekly_goal_minutes: new_goal_minutes,
        }
        .publish(&env);
    }

    pub fn log_session(env: Env, mindful_user: Address, practice_type: String, minutes_spent: u32) {
        mindful_user.require_auth();
        validate_practice_type(&practice_type);
        validate_session_minutes(minutes_spent);

        let mut profile = read_profile_required(&env, &mindful_user);
        sync_week(&mut profile, current_week(&env));
        let had_reached_goal = profile.minutes_this_week >= profile.weekly_goal_minutes;

        let current_day = current_day(&env);
        if profile.session_count == 0 {
            profile.current_streak = 1;
        } else if current_day == profile.last_mindful_day {
        } else if current_day == profile.last_mindful_day + 1 {
            profile.current_streak += 1;
        } else {
            profile.current_streak = 1;
        }

        profile.last_mindful_day = current_day;
        profile.total_minutes += minutes_spent;
        profile.minutes_this_week += minutes_spent;

        let session = MindfulnessSession {
            practice_type: practice_type.clone(),
            minutes_spent,
            timestamp: env.ledger().timestamp(),
            streak_after_log: profile.current_streak,
        };

        write_session(&env, &mindful_user, profile.session_count, &session);
        profile.session_count += 1;
        write_profile(&env, &mindful_user, &profile);

        SessionLogged {
            mindful_user: mindful_user.clone(),
            practice_type,
            minutes_spent,
            minutes_this_week: profile.minutes_this_week,
            current_streak: profile.current_streak,
        }
        .publish(&env);

        if !had_reached_goal && profile.minutes_this_week >= profile.weekly_goal_minutes {
            WeeklyGoalReached {
                mindful_user: mindful_user.clone(),
                weekly_goal_minutes: profile.weekly_goal_minutes,
                minutes_this_week: profile.minutes_this_week,
                current_streak: profile.current_streak,
            }
            .publish(&env);
        }
    }

    pub fn has_profile(env: Env, mindful_user: Address) -> bool {
        env.storage().persistent().has(&DataKey::Profile(mindful_user))
    }

    pub fn get_dashboard(env: Env, mindful_user: Address) -> WellnessDashboard {
        let mut profile = read_profile_required(&env, &mindful_user);
        if current_week(&env) > profile.active_week {
            profile.minutes_this_week = 0;
        }

        WellnessDashboard {
            display_name: profile.display_name,
            weekly_goal_minutes: profile.weekly_goal_minutes,
            total_minutes: profile.total_minutes,
            minutes_this_week: profile.minutes_this_week,
            session_count: profile.session_count,
            current_streak: profile.current_streak,
            created_at: profile.created_at,
            goal_reached_this_week: profile.minutes_this_week >= profile.weekly_goal_minutes,
        }
    }

    pub fn get_session_count(env: Env, mindful_user: Address) -> u32 {
        read_profile_optional(&env, &mindful_user)
            .map(|profile| profile.session_count)
            .unwrap_or(0)
    }

    pub fn get_session(env: Env, mindful_user: Address, index: u32) -> MindfulnessSession {
        let count = Self::get_session_count(env.clone(), mindful_user.clone());
        assert!(index < count, "Session index out of bounds");

        env.storage()
            .persistent()
            .get(&DataKey::Session(mindful_user, index))
            .unwrap_or_else(|| panic!("Session not found"))
    }
}

fn read_profile_optional(env: &Env, mindful_user: &Address) -> Option<WellnessProfile> {
    env.storage()
        .persistent()
        .get(&DataKey::Profile(mindful_user.clone()))
}

fn read_profile_required(env: &Env, mindful_user: &Address) -> WellnessProfile {
    read_profile_optional(env, mindful_user).unwrap_or_else(|| panic!("Profile not found"))
}

fn write_profile(env: &Env, mindful_user: &Address, profile: &WellnessProfile) {
    env.storage()
        .persistent()
        .set(&DataKey::Profile(mindful_user.clone()), profile);
}

fn write_session(env: &Env, mindful_user: &Address, index: u32, session: &MindfulnessSession) {
    env.storage()
        .persistent()
        .set(&DataKey::Session(mindful_user.clone(), index), session);
}

fn sync_week(profile: &mut WellnessProfile, current_week: u64) {
    if current_week > profile.active_week {
        profile.active_week = current_week;
        profile.minutes_this_week = 0;
    }
}

fn current_week(env: &Env) -> u64 {
    env.ledger().timestamp() / WEEK_IN_SECONDS
}

fn current_day(env: &Env) -> u64 {
    env.ledger().timestamp() / DAY_IN_SECONDS
}

fn validate_display_name(display_name: &String) {
    let length = display_name.len();
    assert!(length >= 3 && length <= 32, "Display name must be 3-32 chars");
}

fn validate_practice_type(practice_type: &String) {
    let length = practice_type.len();
    assert!(length >= 3 && length <= 48, "Practice type must be 3-48 chars");
}

fn validate_session_minutes(minutes_spent: u32) {
    assert!(
        (MIN_SESSION_MINUTES..=MAX_SESSION_MINUTES).contains(&minutes_spent),
        "Session minutes out of range"
    );
}

fn validate_weekly_goal(weekly_goal_minutes: u32) {
    assert!(
        (MIN_GOAL_MINUTES..=MAX_GOAL_MINUTES).contains(&weekly_goal_minutes),
        "Weekly goal out of range"
    );
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Event,
    };

    fn setup() -> (Env, Address, MindBloomClient<'static>, Address) {
        let env = Env::default();
        let contract_id = env.register(MindBloom, ());
        let client = MindBloomClient::new(&env, &contract_id);
        let mindful_user = Address::generate(&env);
        env.mock_all_auths();
        (env, contract_id, client, mindful_user)
    }

    fn text(env: &Env, value: &str) -> String {
        String::from_str(env, value)
    }

    #[test]
    fn creates_profile_and_reads_dashboard() {
        let (env, _, client, mindful_user) = setup();

        client.save_profile(&mindful_user, &text(&env, "Still Harbor"), &360);
        let dashboard = client.get_dashboard(&mindful_user);

        assert_eq!(dashboard.display_name, text(&env, "Still Harbor"));
        assert_eq!(dashboard.weekly_goal_minutes, 360);
        assert_eq!(dashboard.total_minutes, 0);
        assert!(!dashboard.goal_reached_this_week);
    }

    #[test]
    fn logs_sessions_and_grows_calm_streak_across_days() {
        let (env, _, client, mindful_user) = setup();

        client.save_profile(&mindful_user, &text(&env, "Quiet Ember"), &300);
        client.log_session(&mindful_user, &text(&env, "Meditation"), &90);

        env.ledger().set_timestamp(DAY_IN_SECONDS + 90);
        client.log_session(&mindful_user, &text(&env, "Breathing"), &45);

        let dashboard = client.get_dashboard(&mindful_user);
        let session = client.get_session(&mindful_user, &1);

        assert_eq!(dashboard.total_minutes, 135);
        assert_eq!(dashboard.minutes_this_week, 135);
        assert_eq!(dashboard.session_count, 2);
        assert_eq!(dashboard.current_streak, 2);
        assert_eq!(session.practice_type, text(&env, "Breathing"));
        assert_eq!(session.minutes_spent, 45);
    }

    #[test]
    fn resets_weekly_progress_after_boundary() {
        let (env, _, client, mindful_user) = setup();

        client.save_profile(&mindful_user, &text(&env, "Golden Dawn"), &240);
        client.log_session(&mindful_user, &text(&env, "Body Scan"), &120);

        env.ledger().set_timestamp(WEEK_IN_SECONDS + DAY_IN_SECONDS);
        let dashboard = client.get_dashboard(&mindful_user);

        assert_eq!(dashboard.minutes_this_week, 0);
        assert_eq!(dashboard.total_minutes, 120);
    }

    #[test]
    #[should_panic(expected = "Profile not found")]
    fn rejects_missing_profile_session_logs() {
        let (env, _, client, mindful_user) = setup();
        client.log_session(&mindful_user, &text(&env, "Meditation"), &60);
    }

    #[test]
    #[should_panic(expected = "Display name must be 3-32 chars")]
    fn rejects_short_display_names() {
        let (env, _, client, mindful_user) = setup();
        client.save_profile(&mindful_user, &text(&env, "AB"), &200);
    }

    #[test]
    #[should_panic(expected = "Session minutes out of range")]
    fn rejects_short_sessions() {
        let (env, _, client, mindful_user) = setup();
        client.save_profile(&mindful_user, &text(&env, "Soft Orbit"), &200);
        client.log_session(&mindful_user, &text(&env, "Breathing"), &4);
    }

    #[test]
    #[should_panic(expected = "Weekly goal out of range")]
    fn rejects_bad_goal_updates() {
        let (env, _, client, mindful_user) = setup();
        client.save_profile(&mindful_user, &text(&env, "Rest Tide"), &200);
        client.update_weekly_goal(&mindful_user, &20);
    }

    #[test]
    fn emits_goal_reached_event_once_when_threshold_is_crossed() {
        let (env, contract_id, client, mindful_user) = setup();

        client.save_profile(&mindful_user, &text(&env, "Calm Current"), &120);
        client.log_session(&mindful_user, &text(&env, "Meditation"), &60);
        client.log_session(&mindful_user, &text(&env, "Reflection"), &60);

        let goal_reached_event = WeeklyGoalReached {
            mindful_user: mindful_user.clone(),
            weekly_goal_minutes: 120,
            minutes_this_week: 120,
            current_streak: 1,
        }
        .to_xdr(&env, &contract_id);

        let threshold_events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(threshold_events.events().len(), 2);
        assert_eq!(threshold_events.events()[1], goal_reached_event);

        client.log_session(&mindful_user, &text(&env, "Gratitude"), &30);
        let post_goal_events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(post_goal_events.events().len(), 1);

        let dashboard = client.get_dashboard(&mindful_user);
        assert!(dashboard.goal_reached_this_week);
        assert_eq!(dashboard.minutes_this_week, 150);
    }
}
