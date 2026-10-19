import { describe, expect, it } from 'vitest';
import { consensusName, type NameVote } from '../src/catalogue/nameConsensus.js';
import { displayName } from '../src/catalogue/productName.js';

const votes = (...names: string[]): NameVote[] => names.map((name, i) => ({ shop: `shop-${i}`, name }));

describe('consensus name: a strict majority of the shops decides', () => {
  it('shows the name most shops give, not the first listing\'s', () => {
    expect(consensusName('Jimmy Choo Rose Passion', 'Jimmy Choo', votes('Jimmy Choo Rose Passion', 'Rose Passion', 'Rose Passion', 'Rose Passion'))).toBe('Rose Passion');
    expect(consensusName('Show Me Love Escada', 'Escada', votes('Show Me Love Escada', 'Show Me Love', 'Show Me Love'))).toBe('Show Me Love');
  });
  it('needs three shops and more than half of them', () => {
    expect(consensusName('Rose Passion Jimmy Choo', 'Jimmy Choo', votes('Rose Passion Jimmy Choo', 'Rose Passion'))).toBeNull();
    expect(consensusName('Rose Passion Jimmy Choo', 'Jimmy Choo', votes('Rose Passion Jimmy Choo', 'Rose Passion', 'Rose Passion Jimmy Choo', 'Rose Passion'))).toBeNull();
  });
  it('counts a shop once, whatever number of rows it has', () => {
    const v: NameVote[] = [
      { shop: 'a', name: 'Amour Kenzo' }, { shop: 'b', name: 'Amour' },
      { shop: 'b', name: 'Amour' }, { shop: 'b', name: 'Amour' }, { shop: 'c', name: 'Amour Kenzo' },
    ];
    expect(consensusName('Amour Kenzo', 'Kenzo', v)).toBeNull();
  });
  it('never loses a series prefix, a strength word or an audience word', () => {
    expect(consensusName('Club De Nuit Intense Man', 'Armaf', votes('Club De Nuit Intense Man', 'Intense Man', 'Intense Man'))).toBeNull();
    expect(consensusName('Emporio Armani Diamonds', 'Armani', votes('Emporio Armani Diamonds', 'Diamonds', 'Diamonds'))).toBeNull();
    expect(consensusName('Miss Dior Blooming Bouquet', 'Dior', votes('Miss Dior Blooming Bouquet', 'Blooming Bouquet', 'Blooming Bouquet'))).toBeNull();
    expect(consensusName('Flower by Kenzo Poppy Bouquet', 'Kenzo', votes('Flower by Kenzo Poppy Bouquet', 'Flower Poppy Bouquet', 'Flower Poppy Bouquet'))).toBeNull();
    expect(consensusName('Pride Nebras Elixir', 'Lattafa', votes('Pride Nebras Elixir', 'Nebras', 'Nebras'))).toBeNull();
    expect(consensusName('Sauvage Elixir', 'Dior', votes('Sauvage Elixir', 'Sauvage', 'Sauvage'))).toBeNull();
    expect(consensusName('Yara For Women', 'Lattafa', votes('Yara For Women', 'Yara', 'Yara'))).toBeNull();
  });
  it('never adds who it is for, part of the house, or leaves a generic or one letter name', () => {
    expect(consensusName('Obsession', 'Calvin Klein', votes('Obsession', 'Obsession For Men', 'Obsession For Men'))).toBeNull();
    expect(consensusName('Dreams', 'Anna Sui', votes('Dreams', 'Sui Dreams', 'Sui Dreams'))).toBeNull();
    expect(consensusName('Ted Baker M', 'Ted Baker', votes('Ted Baker M', 'M', 'M'))).toBeNull();
    expect(consensusName('Mon Guerlain', 'Guerlain', votes('Mon Guerlain', 'Mon', 'Mon'))).toBeNull();
    expect(consensusName('Lacoste Red', 'Lacoste', votes('Lacoste Red', 'Red', 'Red'))).toBeNull();
    expect(consensusName('Jil Sander No.4', 'Jil Sander', votes('Jil Sander No.4', 'No. 4', 'No. 4'))).toBe('No. 4');
    expect(consensusName('Seductive', 'Guess', votes('Seductive', 'Guess Seductive', 'Guess Seductive'))).toBe('Guess Seductive');
  });
  it('may add the words the shops agree on, and drop the house at either end', () => {
    expect(consensusName('Sauvage', 'Dior', votes('Sauvage', 'Sauvage Elixir', 'Sauvage Elixir'))).toBe('Sauvage Elixir');
    expect(consensusName('Dior Sauvage Elixir', 'Dior', votes('Dior Sauvage Elixir', 'Sauvage Elixir', 'Sauvage Elixir'))).toBe('Sauvage Elixir');
    expect(consensusName('Flower by Kenzo', 'Kenzo', votes('Flower by Kenzo', 'Flower by Kenzo', 'Flower'))).toBeNull();
    expect(consensusName('Hawas Perfume', 'Rasasi', votes('Hawas Perfume', 'Hawas', 'Hawas'))).toBe('Hawas');
  });
  it('is deterministic: the commonest spelling, then the current one, then the smaller string', () => {
    expect(consensusName('Dior Sauvage', 'Dior', votes('Dior Sauvage', 'SAUVAGE', 'Sauvage', 'Sauvage'))).toBe('Sauvage');
    expect(consensusName('Dior Sauvage', 'Dior', votes('Dior Sauvage', 'SAUVAGE', 'Sauvage', 'Sauvage'.toLowerCase()))).toBe('SAUVAGE');
    const a = consensusName('Dior Sauvage', 'Dior', votes('Sauvage', 'Dior Sauvage', 'Sauvage'));
    const b = consensusName('Dior Sauvage', 'Dior', votes('Sauvage', 'Sauvage', 'Dior Sauvage'));
    expect(a).toBe(b);
  });
  it('never reopens a family checked against the web', () => {
    expect(consensusName('Karl Lagerfeld For Her', 'Karl Lagerfeld', votes('Karl Lagerfeld For Her', 'For Her', 'For Her'))).toBeNull();
    expect(consensusName('Rose Passion', 'Jimmy Choo', votes('Rose Passion', 'Jimmy Choo Rose Passion', 'Jimmy Choo Rose Passion'))).toBeNull();
  });
});

describe('house written before and after the name in one shop\'s title', () => {
  it('drops the trailing repeat', () => {
    expect(displayName('Jimmy Choo Illicit Flower Jimmy Choo Eau de Toilette Spray 100ml Jimmy Choo', 'Jimmy Choo', 'Jimmy Choo')).toBe('Illicit Flower');
    expect(displayName('Hugo Boss Boss Bottled Tonic Hugo Boss Eau de Toilette Spray 100ml Hugo Boss', 'Hugo Boss', 'Hugo Boss')).toBe('Boss Bottled Tonic');
    expect(displayName('Narciso Rodriguez All of Me Narciso Rodriguez Eau de Parfum Spray 50ml Narciso Rodriguez', 'Narciso Rodriguez', 'Narciso Rodriguez')).toBe('All of Me');
  });
  it('keeps a house that is part of the name', () => {
    expect(displayName('Guerlain Mon Guerlain Eau de Parfum Spray 50ml Guerlain', 'Guerlain', 'Guerlain')).toBe('Mon Guerlain');
    expect(displayName("Hermes Terre d'Hermes Eau de Toilette Spray 100ml Hermes", 'Hermes', 'Hermes')).toBe("Terre d'Hermes");
    expect(displayName('Miss Dior Eau de Parfum 50ml', 'Dior', 'Dior')).toBe('Miss Dior');
    expect(displayName('My Burberry Eau de Parfum 50ml', 'Burberry', 'Burberry')).toBe('My Burberry');
    expect(displayName('Mon Guerlain Eau de Parfum 50ml', 'Guerlain', 'Guerlain')).toBe('Mon Guerlain');
    expect(displayName('Vanderbilt Miss Vanderbilt Eau de Toilette Spray 30ml Vanderbilt', 'Vanderbilt', 'Vanderbilt')).toBe('Miss Vanderbilt');
  });
});

describe('a real name that contains the word Perfume keeps it', () => {
  it('Pocket Perfume, Not a Perfume, I Don\'t Know What Pocket Perfume', () => {
    expect(displayName('Pistachio Pocket Perfume 10ml', 'D.S. & Durga', 'D.S. & Durga')).toBe('Pistachio Pocket Perfume');
    expect(displayName("D.S. & Durga I Don't Know What Pocket Perfume Spray 10ml", 'D.S. & Durga', 'D.S. & Durga')).toBe("I Don't Know What Pocket Perfume");
    expect(displayName('Pocket Perfume For Women', 'D.S. & Durga', 'D.S. & Durga')).toBe('Pocket Perfume For Women');
    expect(displayName('Not a Perfume', 'Juliette Has a Gun', 'Juliette Has a Gun')).toBe('Not a Perfume');
    expect(displayName('Black Magenta Pocket Perfume D.S. & Durga', 'D.S. & Durga', 'D.S. & Durga')).toBe('Black Magenta Pocket Perfume');
  });
  it('the generic word a shop adds still comes off', () => {
    expect(displayName('Hawas Sapphire Perfume', 'Rasasi', 'Rasasi')).toBe('Hawas Sapphire');
    expect(displayName('Yara Perfume For Women', 'Lattafa', 'Lattafa')).toBe('Yara For Women');
    expect(displayName('Dior Sauvage Elixir Perfume 100ml Dior', 'Dior', 'Dior')).toBe('Sauvage Elixir');
    expect(displayName('Lattafa Mood Unisex Fragrance', 'Lattafa', 'Lattafa')).toBe('Mood Unisex');
    expect(displayName('Burberry Brit Womens Perfume', 'Burberry', 'Burberry')).toBe('Brit Womens');
    expect(displayName('Juliette Has a Gun Not a Perfume For Women', 'Juliette Has a Gun', 'Juliette Has a Gun')).toBe('Not a Perfume For Women');
  });
});
