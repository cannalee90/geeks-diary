import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { NoteModule } from '../note';
import { SettingsModule } from '../settings';
import { UiModule } from '../ui/ui.module';
import { VcsModule } from '../vcs';
import {
    AppNoteContributionMeasurementProvider,
    AppNoteContributionUpdatedEffectActionsRegistration,
    AppVcsDetectChangesEffectActionsProvider,
    AppVcsHistoryChangedEffectActionsProvider,
    AppVcsItemFactoriesProvider,
} from './app-configs';
import { AppLayoutModule } from './app-layout';
import { AppSettingsModule } from './app-settings';
import { AppComponent } from './app.component';
import { appReducer } from './app.reducer';


@NgModule({
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        UiModule,
        StoreModule.forRoot(appReducer),
        StoreDevtoolsModule.instrument(),
        EffectsModule.forRoot([]),
        AppLayoutModule,
        AppSettingsModule,
        NoteModule,
        VcsModule,
        SettingsModule,
    ],
    providers: [
        AppVcsItemFactoriesProvider,
        AppVcsDetectChangesEffectActionsProvider,
        AppVcsHistoryChangedEffectActionsProvider,
        AppNoteContributionUpdatedEffectActionsRegistration,
        AppNoteContributionMeasurementProvider,
    ],
    declarations: [AppComponent],
    bootstrap: [AppComponent],
})
export class AppModule {
}
