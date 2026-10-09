// Redux Toolkit store (ADR-010). Nothing here is persisted; personal data goes through lib/storage (encrypted).
import {
  combineReducers,
  configureStore,
  createSlice,
  type PayloadAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { api } from '@/lib/api';
import type { Language } from '@/lib/i18n';

interface SettingsState {
  language: Language;
}

const settings = createSlice({
  name: 'settings',
  initialState: { language: 'en' } as SettingsState,
  reducers: {
    languageChanged(state, action: PayloadAction<Language>) {
      state.language = action.payload;
    },
  },
});

export const { languageChanged } = settings.actions;

/** Quick exit and sign-out (FR-42) dispatch this to drop every cached API result that could hold health data. */
export const clearSession = { type: 'session/cleared' } as const;

const appReducer = combineReducers({ settings: settings.reducer, [api.reducerPath]: api.reducer });
const rootReducer = (state: ReturnType<typeof appReducer> | undefined, action: UnknownAction) =>
  appReducer(
    action.type === clearSession.type ? { settings: state?.settings ?? { language: 'en' } } : state,
    action,
  );

export function createStore() {
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
}

export const store = createStore();
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
