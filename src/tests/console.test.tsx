// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useApp } from '../app/store';
import { SupervisionConsole } from '../ui/supervision/Console';

/**
 * Test de fumée de la console de supervision : vérifie qu'elle se rend sans
 * erreur, qu'elle expose ses panneaux et que ses commandes agissent bien sur
 * l'état (et pas seulement sur l'affichage).
 */

function renderConsole() {
  return render(
    <MemoryRouter>
      <SupervisionConsole />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('centre de supervision', () => {
  it('affiche ses panneaux principaux', () => {
    renderConsole();
    expect(screen.getByText(/Centre de supervision/)).toBeTruthy();
    expect(screen.getByText('Commandes de simulation')).toBeTruthy();
    expect(screen.getByText('Scénarios prédéfinis')).toBeTruthy();
    expect(screen.getByText('Émission d’un message')).toBeTruthy();
    expect(screen.getByText('État du réseau')).toBeTruthy();
    expect(screen.getByText('Journal d’événements')).toBeTruthy();
    expect(screen.getAllByText('SIMULÉ').length).toBeGreaterThan(0);
  });

  it('dessine les nœuds et les liens de la topologie', () => {
    renderConsole();
    const svg = document.querySelector('svg')!;
    expect(svg).toBeTruthy();
    // Les 8 nœuds de référence sont étiquetés (A…F, HUB, Mariam).
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('HUB')).toBeTruthy();
    // L'étiquette du nœud est bien rendue dans le SVG de la topologie.
    expect(svg.textContent).toContain('Aminata');
    expect(screen.getAllByText('Rel. Sud').length).toBeGreaterThan(0);
  });

  it('sélectionne un nœud et affiche son inspecteur', () => {
    renderConsole();
    const svg = document.querySelector('svg')!;
    const label = [...svg.querySelectorAll('text')].find((t) => t.textContent?.includes('Aminata'));
    expect(label).toBeTruthy();
    fireEvent.click(label!);
    expect(screen.getByText('Inspecteur de nœud')).toBeTruthy();
    expect(screen.getByText('phone-aminata')).toBeTruthy();
    expect(screen.getByText('Appareil utilisateur')).toBeTruthy();
    expect(screen.getByText('Batterie simulée')).toBeTruthy();
  });

  it('charge un scénario et journalise la commande', () => {
    renderConsole();
    fireEvent.click(screen.getByText('Panne d’un relais'));
    const journal = useApp.getState().journal;
    expect(journal.some((entry) => entry.text.includes('Scénario 2'))).toBe(true);
    expect(journal.some((entry) => entry.text.includes('Panne programmée'))).toBe(true);
    // Le relais B est encore actif : la panne est différée à 0,8 s.
    const b = useApp.getState().nodes.find((n) => n.id === 'relay-sud');
    expect(b?.status).toBe('online');
  });

  it('envoie un message via le moteur (M001 créé)', () => {
    renderConsole();
    const before = Object.keys(useApp.getState().deliveries).length;
    fireEvent.click(screen.getByText('▶ Envoyer le message'));
    const after = useApp.getState().deliveries;
    expect(Object.keys(after).length).toBe(before + 1);
    expect(after.M001).toBeTruthy();
    expect(after.M001.events.some((event) => event.to === 'created')).toBe(true);
  });

  it('met la simulation en pause depuis les commandes', () => {
    renderConsole();
    expect(useApp.getState().simRunning).toBe(true);
    fireEvent.click(screen.getByText(/⏸ Pause/));
    expect(useApp.getState().simRunning).toBe(false);
    fireEvent.click(screen.getByText(/▶ Lancer/));
    expect(useApp.getState().simRunning).toBe(true);
  });
});
